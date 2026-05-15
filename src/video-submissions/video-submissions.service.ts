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
    if (!task) throw new NotFoundException('Task tidak ditemukan');

    if (task.assignedTo !== userId) {
      throw new BadRequestException('Kamu tidak di-assign ke task ini');
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
    if (!task) throw new NotFoundException('Task tidak ditemukan');

    if (task.assignedTo !== userId) {
      throw new BadRequestException('Kamu tidak di-assign ke task ini');
    }

    const pendingVideo = await this.prisma.videoSubmission.findFirst({
      where: { taskId: dto.taskId, status: VideoStatus.Pending },
    });

    if (pendingVideo) {
      throw new BadRequestException(
        `Kamu sudah mengupload V${pendingVideo.version} yang belum direview. Tunggu review dari Korea Team atau upload ulang setelah revisi.`,
      );
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
      title: 'Video baru diupload',
      body: `${video.user.name} mengupload V${video.version} untuk "${video.task.title}"`,
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

    if (!video) throw new NotFoundException('Video tidak ditemukan');

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
      await this.notifications.create({
        userId: video.userId,
        type: 'video_reviewed',
        title:
          dto.status === VideoStatus.Approved
            ? 'Video disetujui'
            : 'Video butuh revisi',
        body:
          dto.status === VideoStatus.Approved
            ? `V${video.version} pada "${video.task.title}" disetujui`
            : `V${video.version} pada "${video.task.title}" ditolak`,
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
        title: 'Task masuk Review',
        body: `Video V${video.version} disetujui — "${updatedTask.title}" otomatis masuk Review`,
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
        title: 'Task masuk Revisi',
        body: `Video V${video.version} ditolak — "${updatedTask.title}" otomatis masuk Revisi`,
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
    if (!video) throw new NotFoundException('Video tidak ditemukan');

    const key = this.r2.getKeyFromUrl(video.fileUrl);
    const signedUrl = await this.r2.generateViewUrl(key);

    return { url: signedUrl, expiresIn: 3600 };
  }
}
