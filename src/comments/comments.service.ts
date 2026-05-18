import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class CommentsService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private notifications: NotificationsService,
  ) {}

  async create(dto: CreateCommentDto, userId: string) {
    await this.validateTaskAccess(dto.taskId, userId);

    if (dto.parentId) {
      const parent = await this.prisma.comment.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw new NotFoundException('errors.parentCommentNotFound');
    }

    if (dto.videoSubmissionId) {
      const video = await this.prisma.videoSubmission.findUnique({
        where: { id: dto.videoSubmissionId },
      });
      if (!video) throw new NotFoundException('errors.videoNotFound');
    }

    const comment = await this.prisma.comment.create({
      data: {
        taskId: dto.taskId,
        videoSubmissionId: dto.videoSubmissionId,
        userId,
        content: dto.content,
        timestampSeconds: dto.timestampSeconds,
        parentId: dto.parentId,
      },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        parent: { select: { id: true } },
        _count: { select: { replies: true } },
      },
    });

    this.eventEmitter.emit('comment.created', { taskId: dto.taskId, comment });

    await this.notifyCommentRecipients(comment, dto, userId);

    return comment;
  }

  private async notifyCommentRecipients(
    comment: { id: string; content: string },
    dto: CreateCommentDto,
    actorId: string,
  ) {
    const task = await this.prisma.task.findUnique({
      where: { id: dto.taskId },
      select: { assignedTo: true, title: true },
    });
    if (!task) return;

    const recipients = new Set<string>();
    if (task.assignedTo !== actorId) recipients.add(task.assignedTo);

    if (dto.parentId) {
      const parent = await this.prisma.comment.findUnique({
        where: { id: dto.parentId },
        select: { userId: true },
      });
      if (parent && parent.userId !== actorId) {
        recipients.add(parent.userId);
      }
    }

    // Parse @mentions from comment content
    const mentionRegex = /@(\S+)/g;
    const mentionedNames: string[] = [];
    let match;
    while ((match = mentionRegex.exec(comment.content)) !== null) {
      mentionedNames.push(match[1].replace(/[.,;:!?]$/, ''));
    }

    if (mentionedNames.length > 0) {
      const mentionedUsers = await this.prisma.user.findMany({
        where: {
          name: { in: mentionedNames },
          id: { not: actorId },
        },
        select: { id: true, name: true },
      });
      for (const u of mentionedUsers) {
        recipients.add(u.id);
      }
    }

    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { name: true },
    });

    const dtos = Array.from(recipients).map((userId) => ({
      userId,
      type: 'comment' as const,
      titleKey: 'notifications.newComment',
      bodyKey: 'notifications.newCommentBody',
      bodyParams: {
        name: actor?.name ?? 'Seseorang',
        title: task.title,
        content: comment.content.slice(0, 100),
      },
      taskId: dto.taskId,
    }));
    if (dtos.length) await this.notifications.createMany(dtos);
  }

  async findByTask(taskId: string, userId: string) {
    await this.validateTaskAccess(taskId, userId);

    return this.prisma.comment.findMany({
      where: { taskId },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        videoSubmission: { select: { id: true, version: true } },
        parent: { select: { id: true, userId: true } },
        _count: { select: { replies: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async remove(id: string, userId: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id } });
    if (!comment) throw new NotFoundException('errors.taskNotFound');

    if (comment.userId !== userId) {
      throw new BadRequestException('errors.cannotDeleteOthersComment');
    }

    await this.prisma.comment.deleteMany({ where: { parentId: id } });
    await this.prisma.comment.delete({ where: { id } });

    return { message: 'common.messages.commentDeleted' };
  }

  private async validateTaskAccess(taskId: string, userId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('errors.taskNotFound');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('errors.userNotFound');

    if (user.role === 'Editor' && task.assignedTo !== userId) {
      throw new BadRequestException('errors.taskNoAccess');
    }
  }
}
