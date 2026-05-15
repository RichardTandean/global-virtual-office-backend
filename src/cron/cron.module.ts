import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReportsModule } from '../reports/reports.module';
import { CronService } from './cron.service';

@Module({
  imports: [PrismaModule, NotificationsModule, ReportsModule],
  providers: [CronService],
})
export class CronModule {}
