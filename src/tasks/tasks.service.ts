import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto, UpdateTaskDto } from './dto/create-task.dto';
import { CreateProgressDto } from './dto/create-progress.dto';
import { TaskStatus } from '@prisma/client';

const STATUS_LABELS: Record<string, string> = {
  Assigned: 'Ditugaskan',
  Editing: 'Dikerjakan',
  NeedToBeReviewed: 'Perlu Direview',
  Review: 'Direview',
  Revise: 'Revisi',
  ReadyToUpload: 'Siap Upload',
  Completed: 'Selesai',
};

const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  Assigned: [TaskStatus.Editing],
  Editing: [TaskStatus.NeedToBeReviewed],
  NeedToBeReviewed: [TaskStatus.Review],
  Review: [TaskStatus.Revise, TaskStatus.ReadyToUpload],
  Revise: [TaskStatus.NeedToBeReviewed],
  ReadyToUpload: [TaskStatus.Completed],
  Completed: [],
};

const EDITOR_ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  Assigned: [TaskStatus.Editing],
  Editing: [TaskStatus.NeedToBeReviewed],
  NeedToBeReviewed: [],
  Review: [],
  Revise: [TaskStatus.NeedToBeReviewed],
  ReadyToUpload: [TaskStatus.Completed],
  Completed: [],
};

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

  async updateStatus(
    id: string,
    status: TaskStatus,
    userId: string,
    role: string,
    extra?: { revisionNote?: string; revisionAttachment?: string; youtubeUrl?: string },
  ) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task tidak ditemukan');

    if (role === 'Editor' && task.assignedTo !== userId) {
      throw new BadRequestException('Kamu tidak memiliki akses ke task ini');
    }

    const currentStatus = task.status as TaskStatus;
    const allowed =
      role === 'Editor'
        ? EDITOR_ALLOWED_TRANSITIONS[currentStatus] || []
        : VALID_TRANSITIONS[currentStatus] || [];

    if (!allowed.includes(status)) {
      const allowedLabels = allowed.map((s) => STATUS_LABELS[s]).join(', ');
      throw new BadRequestException(
        `Status tidak valid. Dari "${STATUS_LABELS[currentStatus]}" kamu hanya bisa ubah ke: ${allowedLabels || 'tidak bisa ubah status'}`,
      );
    }

    // When KoreaTeam moves Review→Revise, revision note is required
    if (status === TaskStatus.Revise && role !== 'Editor') {
      if (!extra?.revisionNote || extra.revisionNote.trim().length === 0) {
        throw new BadRequestException('Catatan revisi wajib diisi saat memberi revisi');
      }
    }

    const updateData: any = { status };

    if (status === TaskStatus.Revise && extra?.revisionNote) {
      updateData.revisionNote = extra.revisionNote;
      updateData.revisionAttachment = extra.revisionAttachment || null;
    }

    if (status === TaskStatus.Completed) {
      updateData.revisionNote = null;
      updateData.revisionAttachment = null;
      if (extra?.youtubeUrl) {
        updateData.youtubeUrl = extra.youtubeUrl;
      }
    }

    return this.prisma.task.update({
      where: { id },
      data: updateData,
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

    await this.stopAnyRunningTimer(userId);

    const now = new Date();
    const timeLog = await this.prisma.taskTimeLog.create({
      data: { taskId, userId, startedAt: now },
    });

    if (task.status === TaskStatus.Assigned) {
      await this.prisma.task.update({
        where: { id: taskId },
        data: { status: TaskStatus.Editing },
      });
    }

    return { timeLog, isRunning: true, startedAt: now.toISOString() };
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

    const storedDuration = allLogs.reduce((sum, log) => sum + (log.durationMinutes || 0), 0);
    const isRunning = runningLog !== null;

    let currentDurationSeconds = 0;
    if (isRunning) {
      currentDurationSeconds = Math.floor(
        (Date.now() - new Date(runningLog!.startedAt).getTime()) / 1000,
      );
    }

    const totalDurationSeconds = storedDuration * 60 + currentDurationSeconds;

    return {
      isRunning,
      totalDurationMinutes: Math.floor(totalDurationSeconds / 60),
      totalDurationSeconds,
      currentDurationSeconds,
      startedAt: runningLog?.startedAt?.toISOString() || null,
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

    if (dto.percent < task.progressPercent) {
      throw new BadRequestException(
        `Progress tidak boleh mundur. Progress saat ini ${task.progressPercent}%, kamu memasukkan ${dto.percent}%`,
      );
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
        include: { user: { select: { id: true, name: true } } },
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

  // Check if user has active (Editing) tasks — used for clock-out enforcement
  async hasActiveTasks(userId: string): Promise<boolean> {
    const count = await this.prisma.task.count({
      where: { assignedTo: userId, status: TaskStatus.Editing },
    });
    return count > 0;
  }
}
