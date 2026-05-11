import { Module } from '@nestjs/common';
import { TimeTrackerService } from './time-tracker.service';
import { TimeTrackerController } from './time-tracker.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TimeTrackerController],
  providers: [TimeTrackerService],
})
export class TimeTrackerModule {}
