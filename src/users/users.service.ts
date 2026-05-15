import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hash } from 'bcryptjs';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async findAll() {
    return this.prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(data: { name: string; email: string; password: string; role: string }) {
    const validRoles = ['Editor', 'KoreaTeam', 'Admin'];
    if (!validRoles.includes(data.role)) {
      throw new ConflictException('Role tidak valid');
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existing) {
      throw new ConflictException('Email sudah terdaftar');
    }

    const passwordHash = await hash(data.password, 12);
    const user = await this.prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash,
        role: data.role as any,
      },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    await this.notifications.create({
      userId: user.id,
      type: 'user_created',
      title: 'Selamat datang di Lejel WFH!',
      body: `Halo ${user.name}, akun Anda telah dibuat sebagai ${data.role}. Selamat bekerja!`,
    });

    return user;
  }

  async remove(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User tidak ditemukan');

    await this.prisma.user.delete({ where: { id } });

    return { message: 'User berhasil dihapus' };
  }
}
