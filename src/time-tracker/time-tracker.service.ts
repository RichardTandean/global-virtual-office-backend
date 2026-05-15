import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { startOfDay } from 'date-fns';
import type { TimeLog } from '@prisma/client';

function workSecondsForOpenLog(log: TimeLog, nowMs: number): number {
  const clockInMs = new Date(log.clockIn).getTime();
  const grossSec = Math.floor((nowMs - clockInMs) / 1000);
  const completedBreakSec = (log.breakMinutesTotal ?? 0) * 60;
  const currentBreakSec = log.breakStartedAt
    ? Math.floor((nowMs - new Date(log.breakStartedAt).getTime()) / 1000)
    : 0;
  return Math.max(0, grossSec - completedBreakSec - currentBreakSec);
}

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
    const isOnBreak = isClockedIn && todayLog!.breakStartedAt !== null;

    const todayLogs = await this.prisma.timeLog.findMany({
      where: { userId, date: today },
      orderBy: { clockIn: 'desc' },
    });

    const storedSeconds = todayLogs.reduce((sum, log) => {
      if (!log.clockOut) return sum;
      return sum + (log.durationMinutes || 0) * 60;
    }, 0);

    let currentWorkSeconds = 0;
    if (isClockedIn && todayLog) {
      currentWorkSeconds = workSecondsForOpenLog(todayLog, Date.now());
    }

    const totalDurationSeconds = storedSeconds + currentWorkSeconds;

    return {
      isClockedIn,
      isOnBreak,
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
      data: {
        userId,
        clockIn: now,
        date: today,
        breakMinutesTotal: 0,
        breakStartedAt: null,
      },
    });

    return { timeLog, isClockedIn: true };
  }

  async startBreak(userId: string) {
    const today = startOfDay(new Date());
    const now = new Date();

    const timeLog = await this.prisma.timeLog.findFirst({
      where: { userId, date: today, clockOut: null },
      orderBy: { clockIn: 'desc' },
    });

    if (!timeLog) {
      throw new BadRequestException('Belum clock-in hari ini');
    }
    if (timeLog.breakStartedAt) {
      throw new BadRequestException('Kamu sedang dalam istirahat');
    }

    const updated = await this.prisma.timeLog.update({
      where: { id: timeLog.id },
      data: { breakStartedAt: now },
    });

    return { timeLog: updated, isOnBreak: true };
  }

  async endBreak(userId: string) {
    const today = startOfDay(new Date());
    const now = new Date();

    const timeLog = await this.prisma.timeLog.findFirst({
      where: { userId, date: today, clockOut: null },
      orderBy: { clockIn: 'desc' },
    });

    if (!timeLog) {
      throw new BadRequestException('Belum clock-in hari ini');
    }
    if (!timeLog.breakStartedAt) {
      throw new BadRequestException('Tidak sedang istirahat');
    }

    const breakExtraMin = Math.floor(
      (now.getTime() - new Date(timeLog.breakStartedAt).getTime()) / 60000,
    );

    const updated = await this.prisma.timeLog.update({
      where: { id: timeLog.id },
      data: {
        breakStartedAt: null,
        breakMinutesTotal: timeLog.breakMinutesTotal + breakExtraMin,
      },
    });

    return { timeLog: updated, isOnBreak: false };
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

    const activeTasks = await this.prisma.task.count({
      where: { assignedTo: userId, status: 'Editing' },
    });

    if (activeTasks > 0) {
      throw new BadRequestException(
        `Kamu masih punya ${activeTasks} task dengan status "Dikerjakan". Kirim progress atau ubah status task terlebih dahulu sebelum clock-out.`,
      );
    }

    let breakMinutesTotal = timeLog.breakMinutesTotal;
    if (timeLog.breakStartedAt) {
      breakMinutesTotal += Math.floor(
        (now.getTime() - new Date(timeLog.breakStartedAt).getTime()) / 60000,
      );
    }

    const grossMinutes = Math.floor(
      (now.getTime() - new Date(timeLog.clockIn).getTime()) / 60000,
    );
    const durationMinutes = Math.max(0, grossMinutes - breakMinutesTotal);

    const updated = await this.prisma.timeLog.update({
      where: { id: timeLog.id },
      data: {
        clockOut: now,
        durationMinutes,
        breakStartedAt: null,
        breakMinutesTotal,
      },
    });

    return { timeLog: updated, isClockedIn: false };
  }
}
