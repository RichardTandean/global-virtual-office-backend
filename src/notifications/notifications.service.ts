import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationType, Role, Prisma } from '@prisma/client';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateNotificationDto {
  userId: string;
  type: NotificationType;
  title?: string;
  body?: string;
  titleKey?: string | null;
  titleParams?: Record<string, any> | null;
  bodyKey?: string | null;
  bodyParams?: Record<string, any> | null;
  taskId?: string | null;
}

export const NOTIFICATION_CREATED = 'notification.created';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly i18n: I18nService,
  ) {}

  async create(dto: CreateNotificationDto) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: dto.userId,
        type: dto.type,
        title: dto.title ?? '',
        body: dto.body ?? '',
        titleKey: dto.titleKey ?? null,
        titleParams: (dto.titleParams ?? undefined) as any,
        bodyKey: dto.bodyKey ?? null,
        bodyParams: (dto.bodyParams ?? undefined) as any,
        taskId: dto.taskId ?? null,
      },
    });

    this.eventEmitter.emit(NOTIFICATION_CREATED, notification);
    return notification;
  }

  async createMany(dtos: CreateNotificationDto[]) {
    if (dtos.length === 0) return [];
    const results = await Promise.all(dtos.map((d) => this.create(d)));
    return results;
  }

  async notifyRole(
    role: Role,
    payload: Omit<CreateNotificationDto, 'userId'>,
    excludeUserId?: string,
  ) {
    const users = await this.prisma.user.findMany({
      where: {
        role,
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
      select: { id: true },
    });
    return this.createMany(users.map((u) => ({ ...payload, userId: u.id })));
  }

  async list(
    userId: string,
    opts: { unreadOnly?: boolean; take?: number; cursor?: string } = {},
  ) {
    const take = Math.min(opts.take ?? 50, 100);
    const where = {
      userId,
      ...(opts.unreadOnly ? { isRead: false } : {}),
    };

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { locale: true },
    });
    const lang = user?.locale || 'id';

    const items = await this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(opts.cursor
        ? { cursor: { id: opts.cursor }, skip: 1 }
        : {}),
    });

    const resolved = items.map((item: any) => {
      if (item.titleKey) {
        item.title = this.i18n.translate(item.titleKey, {
          lang,
          args: item.titleParams || undefined,
          defaultValue: item.title || '',
        });
      }
      if (item.bodyKey) {
        item.body = this.i18n.translate(item.bodyKey, {
          lang,
          args: item.bodyParams || undefined,
          defaultValue: item.body || '',
        });
      }
      return item;
    });

    let nextCursor: string | null = null;
    if (resolved.length > take) {
      const next = resolved.pop();
      nextCursor = next?.id ?? null;
    }

    return { items: resolved, nextCursor };
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { count };
  }

  async markRead(id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
  }

  async markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }
}
