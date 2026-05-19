import {
  Controller,
  Get,
  Post,
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
import { CallRoomsService } from './call-rooms.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateCallRoomDto } from './dto/create-call-room.dto';

@Controller('call-rooms')
@UseGuards(JwtAuthGuard)
export class CallRoomsController {
  constructor(
    private readonly callRoomsService: CallRoomsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Get('office')
  async findOffice() {
    return this.callRoomsService.findOrCreateOffice();
  }

  @Post()
  async create(@Body() dto: CreateCallRoomDto, @Request() req: any) {
    return this.callRoomsService.create(dto, req.user.sub);
  }

  @Get()
  async findAll(@Request() req: any) {
    return this.callRoomsService.findAll(req.user.sub);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.callRoomsService.findOne(id);
  }

  @Post(':id/join')
  async join(@Param('id') id: string, @Request() req: any) {
    return this.callRoomsService.join(id, req.user.sub);
  }

  @Post(':id/leave')
  async leave(@Param('id') id: string, @Request() req: any) {
    return this.callRoomsService.leave(id, req.user.sub);
  }

  @Post(':id/invite')
  async invite(
    @Param('id') id: string,
    @Body() body: { userIds: string[] },
    @Request() req: any,
  ) {
    return this.callRoomsService.invite(id, body.userIds, req.user.sub);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req: any) {
    return this.callRoomsService.remove(id, req.user.sub);
  }

  @Sse('stream')
  stream(@Request() req: any): Observable<MessageEvent> {
    return fromEvent(this.eventEmitter, 'call.invite').pipe(
      map((payload: any) => {
        if (payload.invitedUserIds.includes(req.user.sub)) {
          return {
            type: 'call.invite',
            data: JSON.stringify({
              room: payload.room,
              invitedBy: payload.invitedBy,
            }),
          } as MessageEvent;
        }
        return { data: '{}' } as MessageEvent;
      }),
    );
  }
}
