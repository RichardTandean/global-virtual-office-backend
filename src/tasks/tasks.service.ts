import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto, UpdateTaskDto } from './dto/create-task.dto';
import { CreateProgressDto } from './dto/create-progress.dto';
import { TaskStatus } from '@prisma/client';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateTaskDto, assignedBy: string) {
    return this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description,
        briefUrl: dto.briefUrl,
        assignedTo: dto.assignedTo,
        assignedBy,
        deadline: dto.deadline ? new Date(dto.deadline) : undefined,
      },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        assigner: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async findAll(userId: string, role: string) {
    const where = role === 'Editor' ? { assignedTo: userId } : {};
    return this.prisma.task.findMany({
      where,
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        assigner: { select: { id: true, name: true, email: true } },
        progressUpdates: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        timeLogs: {
          where: { endedAt: null },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string, role: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        assigner: { select: { id: true, name: true, email: true } },
        timeLogs: {
          orderBy: { startedAt: 'desc' },
          include: { user: { select: { id: true, name: true } } },
        },
        progressUpdates: {
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });

    if (!task) {
      throw new NotFoundException('Task tidak ditemukan');
    }

    if (role === 'Editor' && task.assignedTo !== userId) {
      throw new BadRequestException('Kamu tidak memiliki akses ke task ini');
    }

    return task;
  }

  async update(id: string, dto: UpdateTaskDto) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task tidak ditemukan');

    return this.prisma.task.update({
      where: { id },
      data: {
        ...dto,
        deadline: dto.deadline ? new Date(dto.deadline) : undefined,
      },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        assigner: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async updateStatus(id: string, status: TaskStatus, userId: string, role: string) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task tidak ditemukan');

    if (role === 'Editor' && task.assignedTo !== userId) {
      throw new BadRequestException('Kamu tidak memiliki akses ke task ini');
    }

    return this.prisma.task.update({
      where: { id },
      data: { status },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        assigner: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async remove(id: string) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task tidak ditemukan');

    await this.prisma.task.delete({ where: { id } });
    return { message: 'Task berhasil dihapus' };
  }

  // Per-task timer
  async startTimer(taskId: string, userId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Task tidak ditemukan');
    if (task.assignedTo !== userId) {
      throw new BadRequestException('Kamu tidak di-assign ke task ini');
    }

    // Auto-stop any running timer for this user on any task
    await this.stopAnyRunningTimer(userId);

    const now = new Date();
    const timeLog = await this.prisma.taskTimeLog.create({
      data: {
        taskId,
        userId,
        startedAt: now,
      },
    });

    // Update task status to InProgress if still Assigned
    if (task.status === TaskStatus.Assigned) {
      await this.prisma.task.update({
        where: { id: taskId },
        data: { status: TaskStatus.InProgress },
      });
    }

    return { timeLog, isRunning: true };
  }

  async stopTimer(taskId: string, userId: string) {
    const runningLog = await this.prisma.taskTimeLog.findFirst({
      where: { taskId, userId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });

    if (!runningLog) {
      throw new BadRequestException('Tidak ada timer yang berjalan untuk task ini');
    }

    const now = new Date();
    const durationMinutes = Math.floor(
      (now.getTime() - new Date(runningLog.startedAt).getTime()) / 60000,
    );

    const updated = await this.prisma.taskTimeLog.update({
      where: { id: runningLog.id },
      data: { endedAt: now, durationMinutes },
    });

    return { timeLog: updated, isRunning: false };
  }

  async getTimerStatus(taskId: string, userId: string) {
    const runningLog = await this.prisma.taskTimeLog.findFirst({
      where: { taskId, userId, endedAt: null },
    });

    const allLogs = await this.prisma.taskTimeLog.findMany({
      where: { taskId, userId },
      orderBy: { startedAt: 'desc' },
    });

    const totalDuration = allLogs.reduce((sum, log) => sum + (log.durationMinutes || 0), 0);
    const isRunning = runningLog !== null;
    const currentDuration = isRunning
      ? Math.floor((Date.now() - new Date(runningLog!.startedAt).getTime()) / 60000)
      : 0;

    return {
      isRunning,
      totalDurationMinutes: totalDuration + currentDuration,
      currentDurationMinutes: currentDuration,
      logs: allLogs,
    };
  }

  private async stopAnyRunningTimer(userId: string) {
    const running = await this.prisma.taskTimeLog.findFirst({
      where: { userId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });

    if (running) {
      const now = new Date();
      const durationMinutes = Math.floor(
        (now.getTime() - new Date(running.startedAt).getTime()) / 60000,
      );
      await this.prisma.taskTimeLog.update({
        where: { id: running.id },
        data: { endedAt: now, durationMinutes },
      });
    }
  }

  // Progress updates
  async createProgress(dto: CreateProgressDto, userId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: dto.taskId } });
    if (!task) throw new NotFoundException('Task tidak ditemukan');
    if (task.assignedTo !== userId) {
      throw new BadRequestException('Kamu tidak di-assign ke task ini');
    }

    const [progress] = await this.prisma.$transaction([
      this.prisma.progressUpdate.create({
        data: {
          taskId: dto.taskId,
          userId,
          fileUrl: dto.fileUrl,
          percent: dto.percent,
          note: dto.note,
        },
        include: {
          user: { select: { id: true, name: true } },
        },
      }),
      this.prisma.task.update({
        where: { id: dto.taskId },
        data: { progressPercent: dto.percent },
      }),
    ]);

    return progress;
  }

  async getProgressUpdates(taskId: string) {
    return this.prisma.progressUpdate.findMany({
      where: { taskId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
