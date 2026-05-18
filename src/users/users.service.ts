import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hash } from 'bcryptjs';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async findAll(includeInactive?: boolean) {
    const where = includeInactive ? {} : { isActive: true };
    return this.prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(data: { name: string; email: string; password: string; role: string }) {
    const validRoles = ['Editor', 'KoreaTeam', 'Admin'];
    if (!validRoles.includes(data.role)) {
      throw new ConflictException('errors.roleInvalid');
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existing) {
      throw new ConflictException('errors.emailRegistered');
    }

    const passwordHash = await hash(data.password, 12);
    const user = await this.prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash,
        role: data.role as any,
      },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    });

    await this.notifications.create({
      userId: user.id,
      type: 'user_created',
      titleKey: 'notifications.userCreated',
      bodyKey: 'notifications.userCreatedBody',
      bodyParams: { name: user.name, role: data.role },
    });

    return user;
  }

  async deactivate(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('errors.userNotFound');
    if (!user.isActive) throw new BadRequestException('errors.userAlreadyInactive');

    await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    return { message: 'common.messages.userDeactivated' };
  }

  async reactivate(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('errors.userNotFound');
    if (user.isActive) throw new BadRequestException('errors.userAlreadyActive');

    await this.prisma.user.update({
      where: { id },
      data: { isActive: true },
    });

    return { message: 'common.messages.userReactivated' };
  }
}
