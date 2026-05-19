import { Module } from '@nestjs/common';
import { CallRoomsController } from './call-rooms.controller';
import { CallRoomsService } from './call-rooms.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [PrismaModule, NotificationsModule, EventsModule],
  controllers: [CallRoomsController],
  providers: [CallRoomsService],
  exports: [CallRoomsService],
})
export class CallRoomsModule {}
