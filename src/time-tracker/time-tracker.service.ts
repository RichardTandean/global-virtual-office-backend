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

    const storedSeconds = todayLogs.reduce(
      (sum, log) => sum + (log.durationMinutes || 0) * 60,
      0,
    );

    let currentSeconds = 0;
    if (isClockedIn) {
      currentSeconds = Math.floor(
        (Date.now() - new Date(todayLog!.clockIn).getTime()) / 1000,
      );
    }

    const totalDurationSeconds = storedSeconds + currentSeconds;

    return {
      isClockedIn,
      todayLog,
      todayLogs,
      totalDurationMinutes: Math.floor(totalDurationSeconds / 60),
      totalDurationSeconds,
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
      where: { userId, date: today, clockOut: null },
    });

    if (existing) {
      throw new BadRequestException('Kamu sudah clock-in hari ini');
    }

    const timeLog = await this.prisma.timeLog.create({
      data: { userId, clockIn: now, date: today },
    });

    return { timeLog, isClockedIn: true };
  }

  async clockOut(userId: string) {
    const today = startOfDay(new Date());
    const now = new Date();

    const timeLog = await this.prisma.timeLog.findFirst({
      where: { userId, date: today, clockOut: null },
      orderBy: { clockIn: 'desc' },
    });

    if (!timeLog) {
      throw new BadRequestException('Belum clock-in hari ini');
    }

    // Enforce: no task can be in "Editing" when clocking out
    const activeTasks = await this.prisma.task.count({
      where: { assignedTo: userId, status: 'Editing' },
    });

    if (activeTasks > 0) {
      throw new BadRequestException(
        `Kamu masih punya ${activeTasks} task dengan status "Dikerjakan". Kirim progress atau ubah status task terlebih dahulu sebelum clock-out.`,
      );
    }

    const durationMinutes = Math.floor(
      (now.getTime() - new Date(timeLog.clockIn).getTime()) / 60000,
    );

    const updated = await this.prisma.timeLog.update({
      where: { id: timeLog.id },
      data: { clockOut: now, durationMinutes },
    });

    return { timeLog: updated, isClockedIn: false };
  }
}
