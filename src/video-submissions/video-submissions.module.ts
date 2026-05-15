import { Module } from '@nestjs/common';
import { VideoSubmissionsController } from './video-submissions.controller';
import { VideoSubmissionsService } from './video-submissions.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [VideoSubmissionsController],
  providers: [VideoSubmissionsService],
  exports: [VideoSubmissionsService],
})
export class VideoSubmissionsModule {}
