import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommentDto } from './dto/create-comment.dto';

@Injectable()
export class CommentsService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  async create(dto: CreateCommentDto, userId: string) {
    await this.validateTaskAccess(dto.taskId, userId);

    if (dto.parentId) {
      const parent = await this.prisma.comment.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw new NotFoundException('Komentar induk tidak ditemukan');
    }

    if (dto.videoSubmissionId) {
      const video = await this.prisma.videoSubmission.findUnique({
        where: { id: dto.videoSubmissionId },
      });
      if (!video) throw new NotFoundException('Video tidak ditemukan');
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

    return comment;
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
    if (!comment) throw new NotFoundException('Komentar tidak ditemukan');

    if (comment.userId !== userId) {
      throw new BadRequestException('Kamu tidak bisa menghapus komentar orang lain');
    }

    await this.prisma.comment.deleteMany({ where: { parentId: id } });
    await this.prisma.comment.delete({ where: { id } });

    return { message: 'Komentar berhasil dihapus' };
  }

  private async validateTaskAccess(taskId: string, userId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Task tidak ditemukan');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User tidak ditemukan');

    if (user.role === 'Editor' && task.assignedTo !== userId) {
      throw new BadRequestException('Kamu tidak memiliki akses ke task ini');
    }
  }
}
