import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto, UpdateTaskDto } from './dto/create-task.dto';
import { CreateProgressDto } from './dto/create-progress.dto';
import { TaskStatus } from '@prisma/client';

function serializeBigInt(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj;
  if (typeof obj === 'bigint') return obj.toString();
  if (Array.isArray(obj)) return obj.map(serializeBigInt);
  if (typeof obj === 'object') {
    const result: any = {};
    for (const key of Object.keys(obj)) {
      result[key] = serializeBigInt(obj[key]);
    }
    return result;
  }
  return obj;
}

const STATUS_LABELS: Record<string, string> = {
  Assigned: 'Ditugaskan',
  Editing: 'Dikerjakan',
  OnHold: 'On Hold',
  NeedToBeReviewed: 'Perlu Direview',
  Review: 'Direview',
  Revise: 'Revisi',
  ReadyToUpload: 'Siap Upload',
  Completed: 'Selesai',
};

const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  Assigned: [TaskStatus.Editing],
  Editing: [TaskStatus.OnHold, TaskStatus.NeedToBeReviewed],
  OnHold: [TaskStatus.Editing],
  NeedToBeReviewed: [TaskStatus.Review],
  Review: [TaskStatus.Revise, TaskStatus.ReadyToUpload],
  Revise: [TaskStatus.OnHold, TaskStatus.NeedToBeReviewed],
  ReadyToUpload: [TaskStatus.Completed],
  Completed: [],
};

const EDITOR_ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  Assigned: [TaskStatus.Editing],
  Editing: [TaskStatus.OnHold, TaskStatus.NeedToBeReviewed],
  OnHold: [TaskStatus.Editing],
  NeedToBeReviewed: [],
  Review: [],
  Revise: [TaskStatus.OnHold, TaskStatus.NeedToBeReviewed],
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
    const tasks = await this.prisma.task.findMany({
      where,
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        assigner: { select: { id: true, name: true, email: true } },
        progressUpdates: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        videoSubmissions: {
          select: { id: true, status: true, version: true },
          orderBy: { version: 'desc' },
        },
        _count: {
          select: { comments: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return serializeBigInt(tasks);
  }

  async findOne(id: string, userId: string, role: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        assigner: { select: { id: true, name: true, email: true } },
        progressUpdates: {
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { id: true, name: true } } },
        },
        videoSubmissions: {
          orderBy: { version: 'desc' },
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        comments: true,
      },
    });

    if (!task) {
      throw new NotFoundException('Task tidak ditemukan');
    }

    if (role === 'Editor' && task.assignedTo !== userId) {
      throw new BadRequestException('Kamu tidak memiliki akses ke task ini');
    }

    return serializeBigInt(task);
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

    // When Editor moves to NeedToBeReviewed or ReadyToUpload, video submission is required
    if (role === 'Editor' && (status === TaskStatus.NeedToBeReviewed || status === TaskStatus.ReadyToUpload)) {
      const videoCount = await this.prisma.videoSubmission.count({
        where: { taskId: id, userId },
      });
      if (videoCount === 0) {
        throw new BadRequestException(
          'Kamu harus mengupload video terlebih dahulu sebelum mengirim untuk review',
        );
      }
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

    const updated = await this.prisma.task.update({
      where: { id },
      data: updateData,
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        assigner: { select: { id: true, name: true, email: true } },
      },
    });

    await this.prisma.taskStatusLog.create({
      data: {
        taskId: id,
        userId,
        fromStatus: currentStatus,
        toStatus: status,
        note:
          status === TaskStatus.Revise
            ? extra?.revisionNote || null
            : status === TaskStatus.Completed && extra?.youtubeUrl
              ? extra.youtubeUrl
              : null,
      },
    });

    return updated;
  }

  async remove(id: string) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task tidak ditemukan');

    await this.prisma.task.delete({ where: { id } });
    return { message: 'Task berhasil dihapus' };
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

    // If task is Editing, auto-move to OnHold when progress is submitted
    const isEditing = task.status === TaskStatus.Editing;

    const ops: any[] = [
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
        data: {
          progressPercent: dto.percent,
          ...(isEditing ? { status: TaskStatus.OnHold } : {}),
        },
      }),
    ];

    if (isEditing) {
      ops.push(
        this.prisma.taskStatusLog.create({
          data: {
            taskId: dto.taskId,
            userId,
            fromStatus: TaskStatus.Editing,
            toStatus: TaskStatus.OnHold,
            note: dto.note ?? null,
          },
        }),
      );
    }

    const [progress] = await this.prisma.$transaction(ops);

    return progress;
  }

  async getProgressUpdates(taskId: string) {
    return this.prisma.progressUpdate.findMany({
      where: { taskId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getStatusLogs(taskId: string) {
    const logs = await this.prisma.taskStatusLog.findMany({
      where: { taskId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return logs;
  }
}
