import {
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  Sse,
  MessageEvent,
  UseGuards,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Observable, fromEvent, map } from 'rxjs';
import { Notification } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  NOTIFICATION_CREATED,
  NotificationsService,
} from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async list(
    @Request() req: any,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('take') take?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.notifications.list(req.user.sub, {
      unreadOnly: unreadOnly === 'true',
      take: take ? parseInt(take, 10) : undefined,
      cursor: cursor || undefined,
    });
  }

  @Get('unread-count')
  @UseGuards(JwtAuthGuard)
  async unreadCount(@Request() req: any) {
    return this.notifications.unreadCount(req.user.sub);
  }

  @Patch(':id/read')
  @UseGuards(JwtAuthGuard)
  async markRead(@Param('id') id: string, @Request() req: any) {
    await this.notifications.markRead(id, req.user.sub);
    return { ok: true };
  }

  @Post('mark-all-read')
  @UseGuards(JwtAuthGuard)
  async markAllRead(@Request() req: any) {
    await this.notifications.markAllRead(req.user.sub);
    return { ok: true };
  }

  @Sse('stream')
  @UseGuards(JwtAuthGuard)
  stream(@Request() req: any): Observable<MessageEvent> {
    const userId = req.user.sub;
    return fromEvent(this.eventEmitter, NOTIFICATION_CREATED).pipe(
      map((payload: Notification) => {
        if (payload.userId !== userId) {
          return { data: { ping: true } } as MessageEvent;
        }
        return {
          id: payload.id,
          type: 'notification',
          data: JSON.stringify(payload),
        } as MessageEvent;
      }),
    );
  }
}
