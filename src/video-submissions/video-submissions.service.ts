import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { R2Service } from '../r2/r2.service';
import { ConfirmUploadDto, UpdateVideoStatusDto, UploadUrlDto } from './dto/video.dto';
import { VideoStatus, Role } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class VideoSubmissionsService {
  constructor(
    private prisma: PrismaService,
    private r2: R2Service,
    private eventEmitter: EventEmitter2,
    private notifications: NotificationsService,
  ) {}

  async generateUploadUrl(dto: UploadUrlDto, userId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: dto.taskId } });
    if (!task) throw new NotFoundException('errors.taskNotFound');

    if (task.assignedTo !== userId) {
      throw new BadRequestException('errors.taskNotAssigned');
    }

    const { signedUrl, key, publicUrl } = await this.r2.generateUploadUrl(
      dto.fileName,
      dto.contentType,
      dto.taskId,
      'videos',
    );

    return { signedUrl, key, publicUrl };
  }

  async confirmUpload(dto: ConfirmUploadDto, userId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: dto.taskId } });
    if (!task) throw new NotFoundException('errors.taskNotFound');

    if (task.assignedTo !== userId) {
      throw new BadRequestException('errors.taskNotAssigned');
    }

    const pendingVideo = await this.prisma.videoSubmission.findFirst({
      where: { taskId: dto.taskId, status: VideoStatus.Pending },
    });

    if (pendingVideo) {
      throw new BadRequestException('errors.videoAlreadyUploaded');
    }

    const latest = await this.prisma.videoSubmission.findFirst({
      where: { taskId: dto.taskId },
      orderBy: { version: 'desc' },
    });

    const nextVersion = latest ? latest.version + 1 : 1;

    const publicUrl = this.r2.getPublicUrl(dto.key);

    const video = await this.prisma.videoSubmission.create({
      data: {
        taskId: dto.taskId,
        userId,
        fileUrl: publicUrl,
        fileSize: dto.fileSize ? BigInt(dto.fileSize) : undefined,
        version: nextVersion,
        status: VideoStatus.Pending,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        task: {
          select: { id: true, title: true, status: true },
        },
      },
    });

    this.eventEmitter.emit('video.submitted', { taskId: dto.taskId, video });

    await this.notifications.notifyRole(Role.KoreaTeam, {
      type: 'video_uploaded',
      titleKey: 'notifications.videoUploaded',
      bodyKey: 'notifications.videoUploadedBody',
      bodyParams: { name: video.user.name, version: video.version, title: video.task.title },
      taskId: dto.taskId,
    });

    return {
      ...video,
      fileSize: video.fileSize?.toString() || null,
    };
  }

  async findByTask(taskId: string) {
    const videos = await this.prisma.videoSubmission.findMany({
      where: { taskId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        _count: { select: { comments: true } },
      },
      orderBy: { version: 'desc' },
    });

    return videos.map((v) => ({
      ...v,
      fileSize: v.fileSize?.toString() || null,
    }));
  }

  async updateStatus(id: string, dto: UpdateVideoStatusDto, userId: string, role: string) {
    const video = await this.prisma.videoSubmission.findUnique({
      where: { id },
      include: { task: true },
    });

    if (!video) throw new NotFoundException('errors.videoNotFound');

    const updated = await this.prisma.videoSubmission.update({
      where: { id },
      data: { status: dto.status },
      include: {
        user: { select: { id: true, name: true, email: true } },
        task: {
          select: { id: true, title: true, status: true },
        },
      },
    });

    this.eventEmitter.emit('video.reviewed', { taskId: video.taskId, video: updated });

    if (dto.status === VideoStatus.Approved || dto.status === VideoStatus.Rejected) {
      const isApproved = dto.status === VideoStatus.Approved;
      await this.notifications.create({
        userId: video.userId,
        type: 'video_reviewed',
        titleKey: isApproved ? 'notifications.videoApproved' : 'notifications.videoRejected',
        bodyKey: isApproved ? 'notifications.videoApprovedBody' : 'notifications.videoRejectedBody',
        bodyParams: { version: video.version, title: video.task.title },
        taskId: video.taskId,
      });
    }

    if (dto.status === VideoStatus.Approved && video.task.status === 'NeedToBeReviewed') {
      const updatedTask = await this.prisma.task.update({
        where: { id: video.taskId },
        data: { status: 'Review' },
        include: { assignee: { select: { id: true, name: true } } },
      });
      await this.prisma.taskStatusLog.create({
        data: {
          taskId: video.taskId,
          userId,
          fromStatus: 'NeedToBeReviewed',
          toStatus: 'Review',
          note: 'Video disetujui oleh reviewer',
        },
      });
      await this.notifications.create({
        userId: video.userId,
        type: 'task_status',
        titleKey: 'notifications.taskAutoReview',
        bodyKey: 'notifications.taskAutoReviewBody',
        bodyParams: { version: video.version, title: updatedTask.title },
        taskId: video.taskId,
      });
    }

    if (dto.status === VideoStatus.Rejected && video.task.status === 'Review') {
      const updatedTask = await this.prisma.task.update({
        where: { id: video.taskId },
        data: { status: 'Revise' },
        include: { assignee: { select: { id: true, name: true } } },
      });
      await this.prisma.taskStatusLog.create({
        data: {
          taskId: video.taskId,
          userId,
          fromStatus: 'Review',
          toStatus: 'Revise',
          note: 'Video ditolak dengan catatan revisi',
        },
      });
      await this.notifications.create({
        userId: video.userId,
        type: 'task_status',
        titleKey: 'notifications.taskAutoRevise',
        bodyKey: 'notifications.taskAutoReviseBody',
        bodyParams: { version: video.version, title: updatedTask.title },
        taskId: video.taskId,
      });
    }

    return {
      ...updated,
      fileSize: updated.fileSize?.toString() || null,
    };
  }

  async getViewUrl(id: string) {
    const video = await this.prisma.videoSubmission.findUnique({ where: { id } });
    if (!video) throw new NotFoundException('errors.videoNotFound');

    const key = this.r2.getKeyFromUrl(video.fileUrl);
    const signedUrl = await this.r2.generateViewUrl(key);

    return { url: signedUrl, expiresIn: 3600 };
  }
}
