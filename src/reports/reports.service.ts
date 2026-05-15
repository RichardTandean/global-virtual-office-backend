import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TaskStatus } from '@prisma/client';

export interface WeeklyReportRow {
  userId: string;
  name: string;
  email: string;
  role: string;
  totalMinutes: number;
  tasksCompleted: number;
  avgMinutesPerTask: number;
}

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  startOfIsoWeek(date: Date): Date {
    const d = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    const day = d.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setUTCDate(d.getUTCDate() + diff);
    return d;
  }

  endOfIsoWeek(weekStart: Date): Date {
    const end = new Date(weekStart);
    end.setUTCDate(end.getUTCDate() + 7);
    return end;
  }

  async generateWeeklyForUser(userId: string, weekStart: Date) {
    const start = this.startOfIsoWeek(weekStart);
    const end = this.endOfIsoWeek(start);

    const [timeLogs, tasksCompleted] = await Promise.all([
      this.prisma.timeLog.aggregate({
        where: {
          userId,
          date: { gte: start, lt: end },
          durationMinutes: { not: null },
        },
        _sum: { durationMinutes: true },
      }),
      this.prisma.taskStatusLog.count({
        where: {
          userId,
          toStatus: TaskStatus.Completed,
          createdAt: { gte: start, lt: end },
        },
      }),
    ]);

    const totalMinutes = timeLogs._sum.durationMinutes ?? 0;

    return this.prisma.weeklyReport.upsert({
      where: { userId_weekStart: { userId, weekStart: start } },
      update: { totalMinutes, tasksCompleted },
      create: {
        userId,
        weekStart: start,
        totalMinutes,
        tasksCompleted,
      },
    });
  }

  async generateWeeklyForAll(weekStart: Date) {
    const start = this.startOfIsoWeek(weekStart);
    const users = await this.prisma.user.findMany({ select: { id: true } });
    for (const u of users) {
      await this.generateWeeklyForUser(u.id, start);
    }
    return { generated: users.length, weekStart: start };
  }

  async getWeekly(weekStart: Date): Promise<WeeklyReportRow[]> {
    const start = this.startOfIsoWeek(weekStart);
    const reports = await this.prisma.weeklyReport.findMany({
      where: { weekStart: start },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    if (reports.length === 0) {
      await this.generateWeeklyForAll(start);
      return this.getWeekly(start);
    }

    return reports.map((r) => ({
      userId: r.userId,
      name: r.user.name,
      email: r.user.email,
      role: r.user.role,
      totalMinutes: r.totalMinutes,
      tasksCompleted: r.tasksCompleted,
      avgMinutesPerTask:
        r.tasksCompleted > 0
          ? Math.round(r.totalMinutes / r.tasksCompleted)
          : 0,
    }));
  }

  async getWeeklyForUser(userId: string, weekStart: Date) {
    const start = this.startOfIsoWeek(weekStart);
    const report = await this.prisma.weeklyReport.findUnique({
      where: { userId_weekStart: { userId, weekStart: start } },
    });
    if (!report) {
      return this.generateWeeklyForUser(userId, start);
    }
    return report;
  }

  toCsv(rows: WeeklyReportRow[]): string {
    const header = [
      'name',
      'email',
      'role',
      'total_hours',
      'tasks_completed',
      'avg_minutes_per_task',
    ].join(',');
    const body = rows
      .map((r) =>
        [
          JSON.stringify(r.name),
          JSON.stringify(r.email),
          r.role,
          (r.totalMinutes / 60).toFixed(2),
          r.tasksCompleted,
          r.avgMinutesPerTask,
        ].join(','),
      )
      .join('\n');
    return `${header}\n${body}\n`;
  }
}
