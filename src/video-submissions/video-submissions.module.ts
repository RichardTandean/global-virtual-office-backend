import { Module } from '@nestjs/common';
import { VideoSubmissionsController } from './video-submissions.controller';
import { VideoSubmissionsService } from './video-submissions.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [VideoSubmissionsController],
  providers: [VideoSubmissionsService],
  exports: [VideoSubmissionsService],
})
export class VideoSubmissionsModule {}
