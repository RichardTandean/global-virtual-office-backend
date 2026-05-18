import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { R2Service } from '../r2/r2.service';
import { UploadAssetUrlDto, ConfirmAssetDto } from './dto/create-asset.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AssetsService {
  constructor(
    private prisma: PrismaService,
    private r2: R2Service,
    private eventEmitter: EventEmitter2,
    private notifications: NotificationsService,
  ) {}

  async generateUploadUrl(dto: UploadAssetUrlDto, userId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: dto.taskId } });
    if (!task) throw new NotFoundException('errors.taskNotFound');

    const { signedUrl, key, publicUrl } = await this.r2.generateUploadUrl(
      dto.fileName,
      dto.contentType,
      dto.taskId,
      'assets',
    );

    return { signedUrl, key, publicUrl };
  }

  async confirmUpload(dto: ConfirmAssetDto, userId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: dto.taskId },
      select: { id: true, title: true, assignedTo: true },
    });
    if (!task) throw new NotFoundException('errors.taskNotFound');

    const uploader = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });

    const publicUrl = this.r2.getPublicUrl(dto.key);

    const asset = await this.prisma.asset.create({
      data: {
        taskId: dto.taskId,
        uploadedBy: userId,
        fileUrl: publicUrl,
        fileType: dto.fileType,
        fileSize: dto.fileSize ? BigInt(dto.fileSize) : undefined,
        label: dto.label,
      },
      include: {
        uploader: { select: { id: true, name: true, email: true } },
      },
    });

    this.eventEmitter.emit('asset.uploaded', { taskId: dto.taskId, asset });

    if (task.assignedTo !== userId) {
      await this.notifications.create({
        userId: task.assignedTo,
        type: 'asset_uploaded',
        titleKey: 'notifications.assetUploaded',
        bodyKey: 'notifications.assetUploadedBody',
        bodyParams: { name: uploader?.name ?? 'Seseorang', title: task.title },
        taskId: dto.taskId,
      });
    }

    return {
      ...asset,
      fileSize: asset.fileSize?.toString() || null,
    };
  }

  async findByTask(taskId: string, userId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('errors.taskNotFound');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('errors.userNotFound');

    if (user.role === 'Editor' && task.assignedTo !== userId) {
      throw new BadRequestException('errors.taskNoAccess');
    }

    const assets = await this.prisma.asset.findMany({
      where: { taskId },
      include: {
        uploader: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return assets.map((a) => ({
      ...a,
      fileSize: a.fileSize?.toString() || null,
    }));
  }

  async remove(id: string, userId: string, role: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('errors.assetNotFound');

    if (role !== 'Admin' && role !== 'KoreaTeam' && asset.uploadedBy !== userId) {
      throw new BadRequestException('errors.cannotDeleteAsset');
    }

    await this.prisma.asset.delete({ where: { id } });
    return { message: 'common.messages.assetDeleted' };
  }
}
