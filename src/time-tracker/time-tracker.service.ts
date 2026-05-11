import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { startOfDay } from 'date-fns';

@Injectable()
export class TimeTrackerService {
  constructor(private prisma: PrismaService) {}

  async getTodayStatus(userId: string) {
    const today = startOfDay(new Date());

    const todayLog = await this.prisma.timeLog.findFirst({
      where: { userId, date: today },
      orderBy: { clockIn: 'desc' },
    });

    const isClockedIn = todayLog !== null && todayLog.clockOut === null;

    const todayLogs = await this.prisma.timeLog.findMany({
      where: { userId, date: today },
      orderBy: { clockIn: 'desc' },
    });

    const totalDuration =
      todayLogs.reduce((sum, log) => sum + (log.durationMinutes || 0), 0) +
      (isClockedIn
        ? Math.floor(
            (Date.now() - new Date(todayLog!.clockIn).getTime()) / 60000,
          )
        : 0);

    return {
      isClockedIn,
      todayLog,
      todayLogs,
      totalDurationMinutes: totalDuration,
    };
  }

  async getTodayAll() {
    const today = startOfDay(new Date());

    const todayLogs = await this.prisma.timeLog.findMany({
      where: { date: today },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { clockIn: 'desc' },
    });

    return { todayLogs };
  }

  async clockIn(userId: string) {
    const today = startOfDay(new Date());
    const now = new Date();

    const existing = await this.prisma.timeLog.findFirst({
      where: {
        userId,
        date: today,
        clockOut: null,
      },
    });

    if (existing) {
      throw new BadRequestException('Kamu sudah clock-in hari ini');
    }

    const timeLog = await this.prisma.timeLog.create({
      data: {
        userId,
        clockIn: now,
        date: today,
      },
    });

    return { timeLog, isClockedIn: true };
  }

  async clockOut(userId: string) {
    const today = startOfDay(new Date());
    const now = new Date();

    const timeLog = await this.prisma.timeLog.findFirst({
      where: {
        userId,
        date: today,
        clockOut: null,
      },
      orderBy: { clockIn: 'desc' },
    });

    if (!timeLog) {
      throw new BadRequestException('Belum clock-in hari ini');
    }

    const durationMinutes = Math.floor(
      (now.getTime() - new Date(timeLog.clockIn).getTime()) / 60000,
    );

    const updated = await this.prisma.timeLog.update({
      where: { id: timeLog.id },
      data: {
        clockOut: now,
        durationMinutes,
      },
    });

    return { timeLog: updated, isClockedIn: false };
  }
}
