import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReportsService } from '../reports/reports.service';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly reports: ReportsService,
  ) {}

  // Daily 08:00 WIB (UTC+7) = 01:00 UTC
  @Cron('0 1 * * *')
  async deadlineWarnings() {
    const now = new Date();
    const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const tasks = await this.prisma.task.findMany({
      where: {
        deadline: { gte: now, lte: next24h },
        status: { notIn: [TaskStatus.Completed, TaskStatus.ReadyToUpload] },
        progressPercent: { lt: 50 },
      },
      select: {
        id: true,
        title: true,
        assignedTo: true,
        deadline: true,
        progressPercent: true,
      },
    });

    for (const t of tasks) {
      await this.notifications.create({
        userId: t.assignedTo,
        type: 'deadline_warning',
        titleKey: 'notifications.deadlineWarning',
        bodyKey: 'notifications.deadlineWarningBody',
        bodyParams: { title: t.title, percent: t.progressPercent },
        taskId: t.id,
      });
    }

    this.logger.log(`deadlineWarnings: notified ${tasks.length} tasks`);
  }

  // Monday 08:00 WIB = Monday 01:00 UTC
  @Cron('0 1 * * 1')
  async generateWeeklyReports() {
    const today = new Date();
    const lastWeek = new Date(today);
    lastWeek.setUTCDate(lastWeek.getUTCDate() - 7);

    const result = await this.reports.generateWeeklyForAll(lastWeek);
    this.logger.log(
      `generateWeeklyReports: generated ${result.generated} reports for ${result.weekStart.toISOString()}`,
    );

    const admins = await this.prisma.user.findMany({
      where: { role: 'Admin' },
      select: { id: true },
    });
    for (const admin of admins) {
      await this.notifications.create({
        userId: admin.id,
        type: 'weekly_report',
        titleKey: 'notifications.weeklyReport',
        bodyKey: 'notifications.weeklyReportBody',
        bodyParams: { weekStart: result.weekStart.toISOString().slice(0, 10) },
      });
    }
  }

  // Every minute: check for meetings starting in 5 minutes
  @Cron('* * * * *')
  async meetingReminders() {
    const now = new Date();
    const in5Min = new Date(now.getTime() + 5 * 60 * 1000);
    const in6Min = new Date(now.getTime() + 6 * 60 * 1000);

    const upcomingMeetings = await this.prisma.callRoom.findMany({
      where: {
        type: 'meeting',
        isActive: true,
        scheduledAt: { gte: in5Min, lt: in6Min },
      },
      include: {
        invites: { select: { userId: true } },
        creator: { select: { name: true } },
      },
    });

    for (const room of upcomingMeetings) {
      const userIds = [...new Set([
        room.createdBy,
        ...room.invites.map((i) => i.userId),
      ])];

      for (const uid of userIds) {
        await this.notifications.create({
          userId: uid,
          type: 'meeting_reminder',
          titleKey: 'notifications.meetingReminder',
          bodyKey: 'notifications.meetingReminderBody',
          bodyParams: { name: room.name },
        });
      }

      this.logger.log(`meetingReminders: reminded ${userIds.length} users for "${room.name}"`);
    }
  }
}
