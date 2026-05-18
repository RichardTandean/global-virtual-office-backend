import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { compare, hash } from 'bcryptjs';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const validRoles = ['Editor', 'KoreaTeam', 'Admin'];
    if (!validRoles.includes(dto.role)) {
      throw new UnauthorizedException('errors.roleInvalid');
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('errors.emailRegistered');
    }

    const passwordHash = await hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash,
        role: dto.role as any,
      },
    });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('errors.emailOrPasswordWrong');
    }

    const isValid = await compare(dto.password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('errors.emailOrPasswordWrong');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('errors.accountDeactivated');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true },
    });

    if (!user) {
      throw new UnauthorizedException('errors.userNotFound');
    }

    return user;
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('errors.userNotFound');
    }

    const isValid = await compare(oldPassword, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('errors.currentPasswordWrong');
    }

    const passwordHash = await hash(newPassword, 12);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return { ok: true };
  }

  async updateLocale(userId: string, locale: string) {
    const validLocales = ['en', 'id', 'ko'];
    if (!validLocales.includes(locale)) {
      throw new UnauthorizedException('errors.localeInvalid');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { locale },
    });

    return { locale };
  }
}
