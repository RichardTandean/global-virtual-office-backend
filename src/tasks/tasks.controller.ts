import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
  Sse,
  MessageEvent,
} from '@nestjs/common';
import { Observable, fromEvent, map, merge } from 'rxjs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateTaskDto, UpdateTaskDto } from './dto/create-task.dto';
import { CreateProgressDto } from './dto/create-progress.dto';
import { TaskStatus } from '@prisma/client';

@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('KoreaTeam', 'Admin')
  async create(@Body() dto: CreateTaskDto, @Request() req: any) {
    return this.tasksService.create(dto, req.user.sub);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(@Request() req: any) {
    return this.tasksService.findAll(req.user.sub, req.user.role);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string, @Request() req: any) {
    return this.tasksService.findOne(id, req.user.sub, req.user.role);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('KoreaTeam', 'Admin')
  async update(@Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.tasksService.update(id, dto);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard)
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: TaskStatus,
    @Request() req: any,
    @Body('revisionNote') revisionNote?: string,
    @Body('revisionAttachment') revisionAttachment?: string,
    @Body('youtubeUrl') youtubeUrl?: string,
  ) {
    return this.tasksService.updateStatus(id, status, req.user.sub, req.user.role, {
      revisionNote,
      revisionAttachment,
      youtubeUrl,
    });
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('KoreaTeam', 'Admin')
  async remove(@Param('id') id: string) {
    return this.tasksService.remove(id);
  }

  // Status log endpoint
  @Get(':id/status-logs')
  @UseGuards(JwtAuthGuard)
  async getStatusLogs(@Param('id') id: string, @Request() req: any) {
    await this.tasksService.findOne(id, req.user.sub, req.user.role);
    return this.tasksService.getStatusLogs(id);
  }

  // Progress endpoints
  @Post('progress')
  @UseGuards(JwtAuthGuard)
  async createProgress(@Body() dto: CreateProgressDto, @Request() req: any) {
    return this.tasksService.createProgress(dto, req.user.sub);
  }

  @Get(':id/progress')
  @UseGuards(JwtAuthGuard)
  async getProgressUpdates(@Param('id') id: string, @Request() req: any) {
    // Validate access
    await this.tasksService.findOne(id, req.user.sub, req.user.role);
    return this.tasksService.getProgressUpdates(id);
  }

  // SSE for real-time progress
  @Sse(':id/progress-stream')
  @UseGuards(JwtAuthGuard)
  progressStream(@Param('id') taskId: string, @Request() req: any): Observable<MessageEvent> {
    return fromEvent(this.eventEmitter, 'progress.updated').pipe(
      map((payload: any) => {
        if (payload.taskId === taskId) {
          return { data: payload.progress } as MessageEvent;
        }
        return { data: {} } as MessageEvent;
      }),
    );
  }

  // SSE for all task events (video, comments, assets)
  @Sse(':id/stream')
  @UseGuards(JwtAuthGuard)
  taskStream(@Param('id') taskId: string): Observable<MessageEvent> {
    const events = ['progress.updated', 'video.submitted', 'video.reviewed', 'comment.created', 'asset.uploaded'];

    const streams = events.map((eventName) =>
      fromEvent(this.eventEmitter, eventName).pipe(
        map((payload: any) => {
          if (payload.taskId === taskId) {
            return {
              id: eventName,
              type: eventName,
              data: JSON.stringify(payload.video || payload.comment || payload.asset || payload.progress),
            } as MessageEvent;
          }
          return { data: {} } as MessageEvent;
        }),
      ),
    );

    return merge(...streams);
  }
}
