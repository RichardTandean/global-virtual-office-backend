import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto, UpdateTaskDto } from './dto/create-task.dto';
import { CreateProgressDto } from './dto/create-progress.dto';
import { TaskStatus, Role } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

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
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private eventEmitter: EventEmitter2,
  ) {}

  async create(dto: CreateTaskDto, assignedBy: string) {
    const task = await this.prisma.task.create({
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

    await this.notifications.create({
      userId: task.assignedTo,
      type: 'task_assigned',
      titleKey: 'notifications.taskAssigned',
      bodyKey: 'notifications.taskAssignedBody',
      bodyParams: { assigner: task.assigner.name, title: task.title },
      taskId: task.id,
    });

    return task;
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
      throw new NotFoundException('errors.taskNotFound');
    }

    if (role === 'Editor' && task.assignedTo !== userId) {
      throw new BadRequestException('errors.taskNoAccess');
    }

    return serializeBigInt(task);
  }

  async update(id: string, dto: UpdateTaskDto) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: { assignee: { select: { id: true, name: true } } },
    });
    if (!task) throw new NotFoundException('errors.taskNotFound');

    const reassigned = dto.assignedTo && dto.assignedTo !== task.assignedTo;

    const updated = await this.prisma.task.update({
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

    if (reassigned) {
      await this.notifications.create({
        userId: dto.assignedTo!,
        type: 'task_reassigned',
        titleKey: 'notifications.taskReassigned',
        bodyKey: 'notifications.taskReassignedBody',
        bodyParams: { title: updated.title },
        taskId: id,
      });
    }

    return updated;
  }

  async updateStatus(
    id: string,
    status: TaskStatus,
    userId: string,
    role: string,
    extra?: { revisionNote?: string; revisionAttachment?: string; youtubeUrl?: string },
  ) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('errors.taskNotFound');

    if (role === 'Editor' && task.assignedTo !== userId) {
      throw new BadRequestException('errors.taskNoAccess');
    }

    const currentStatus = task.status as TaskStatus;
    const allowed =
      role === 'Editor'
        ? EDITOR_ALLOWED_TRANSITIONS[currentStatus] || []
        : VALID_TRANSITIONS[currentStatus] || [];

    if (!allowed.includes(status)) {
      throw new BadRequestException('errors.statusInvalid');
    }

    if (role === 'Editor' && (status === TaskStatus.NeedToBeReviewed || status === TaskStatus.ReadyToUpload)) {
      const videoCount = await this.prisma.videoSubmission.count({
        where: { taskId: id, userId },
      });
      if (videoCount === 0) {
        throw new BadRequestException('errors.videoRequiredBeforeReview');
      }
    }

    if (status === TaskStatus.Revise && role !== 'Editor') {
      if (!extra?.revisionNote || extra.revisionNote.trim().length === 0) {
        throw new BadRequestException('errors.revisionNoteRequired');
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

    await this.emitStatusChangeNotifications(updated, currentStatus, status, extra);

    return updated;
  }

  private async emitStatusChangeNotifications(
    task: { id: string; title: string; assignedTo: string; assignedBy: string },
    fromStatus: TaskStatus,
    toStatus: TaskStatus,
    extra?: { revisionNote?: string },
  ) {
    if (toStatus === TaskStatus.Editing && fromStatus === TaskStatus.Assigned) {
      await this.notifications.create({
        userId: task.assignedBy,
        type: 'task_started',
        titleKey: 'notifications.taskStarted',
        bodyKey: 'notifications.taskStartedBody',
        bodyParams: { title: task.title },
        taskId: task.id,
      });
      return;
    }

    if (toStatus === TaskStatus.OnHold) {
      await this.notifications.create({
        userId: task.assignedBy,
        type: 'task_on_hold',
        titleKey: 'notifications.taskOnHold',
        bodyKey: 'notifications.taskOnHoldBody',
        bodyParams: { title: task.title },
        taskId: task.id,
      });
      return;
    }

    if (fromStatus === TaskStatus.OnHold && (toStatus === TaskStatus.Editing || toStatus === TaskStatus.Revise)) {
      await this.notifications.create({
        userId: task.assignedBy,
        type: 'task_on_hold',
        titleKey: 'notifications.taskResumed',
        bodyKey: 'notifications.taskResumedBody',
        bodyParams: { title: task.title },
        taskId: task.id,
      });
      return;
    }

    if (toStatus === TaskStatus.Revise) {
      await this.notifications.create({
        userId: task.assignedTo,
        type: 'revision',
        titleKey: 'notifications.taskNeedsRevision',
        bodyKey: extra?.revisionNote
          ? 'notifications.taskNeedsRevisionBody'
          : 'notifications.taskNeedsRevisionBodyFallback',
        bodyParams: extra?.revisionNote
          ? { title: task.title, note: extra.revisionNote.slice(0, 120) }
          : { title: task.title },
        taskId: task.id,
      });
      return;
    }

    if (toStatus === TaskStatus.NeedToBeReviewed) {
      await this.notifications.notifyRole(Role.KoreaTeam, {
        type: 'task_status',
        titleKey: 'notifications.taskNeedsReview',
        bodyKey: 'notifications.taskNeedsReviewBody',
        bodyParams: { title: task.title },
        taskId: task.id,
      });
      return;
    }

    if (toStatus === TaskStatus.ReadyToUpload) {
      await this.notifications.notifyRole(Role.KoreaTeam, {
        type: 'task_status',
        titleKey: 'notifications.taskReadyToUpload',
        bodyKey: 'notifications.taskReadyToUploadBody',
        bodyParams: { title: task.title },
        taskId: task.id,
      });
      return;
    }

    if (toStatus === TaskStatus.Completed) {
      await this.notifications.create({
        userId: task.assignedTo,
        type: 'task_status',
        titleKey: 'notifications.taskCompleted',
        bodyKey: 'notifications.taskCompletedBody',
        bodyParams: { title: task.title },
        taskId: task.id,
      });
    }
  }

  async remove(id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: { assignee: { select: { id: true, name: true } } },
    });
    if (!task) throw new NotFoundException('errors.taskNotFound');

    await this.prisma.task.delete({ where: { id } });

    await this.notifications.create({
      userId: task.assignedTo,
      type: 'task_deleted',
      titleKey: 'notifications.taskDeleted',
      bodyKey: 'notifications.taskDeletedBody',
      bodyParams: { title: task.title },
      taskId: task.id,
    });

    return { message: 'common.messages.taskDeleted' };
  }

  // Progress updates
  async createProgress(dto: CreateProgressDto, userId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: dto.taskId },
      include: { assigner: { select: { id: true, name: true } } },
    });
    if (!task) throw new NotFoundException('errors.taskNotFound');
    if (task.assignedTo !== userId) {
      throw new BadRequestException('errors.taskNotAssigned');
    }

    if (dto.percent < task.progressPercent) {
      throw new BadRequestException('errors.progressCannotRegress');
    }

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

    const editor = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });

    await this.notifications.create({
      userId: task.assignedBy,
      type: 'task_progress',
      titleKey: 'notifications.progressNew',
      bodyKey: 'notifications.progressNewBody',
      bodyParams: { editor: editor?.name ?? 'Editor', percent: dto.percent, title: task.title },
      taskId: dto.taskId,
    });

    this.eventEmitter.emit('progress.updated', {
      taskId: dto.taskId,
      progress,
    });

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
