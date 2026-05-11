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
import { Observable, fromEvent, map } from 'rxjs';
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
  ) {
    return this.tasksService.updateStatus(id, status, req.user.sub, req.user.role);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('KoreaTeam', 'Admin')
  async remove(@Param('id') id: string) {
    return this.tasksService.remove(id);
  }

  // Timer endpoints
  @Post(':id/timer/start')
  @UseGuards(JwtAuthGuard)
  async startTimer(@Param('id') id: string, @Request() req: any) {
    return this.tasksService.startTimer(id, req.user.sub);
  }

  @Post(':id/timer/stop')
  @UseGuards(JwtAuthGuard)
  async stopTimer(@Param('id') id: string, @Request() req: any) {
    return this.tasksService.stopTimer(id, req.user.sub);
  }

  @Get(':id/timer')
  @UseGuards(JwtAuthGuard)
  async getTimerStatus(@Param('id') id: string, @Request() req: any) {
    return this.tasksService.getTimerStatus(id, req.user.sub);
  }

  // Progress endpoints
  @Post('progress')
  @UseGuards(JwtAuthGuard)
  async createProgress(@Body() dto: CreateProgressDto, @Request() req: any) {
    const progress = await this.tasksService.createProgress(dto, req.user.sub);
    this.eventEmitter.emit('progress.updated', { taskId: dto.taskId, progress });
    return progress;
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
}
