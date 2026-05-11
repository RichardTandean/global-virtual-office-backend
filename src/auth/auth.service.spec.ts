import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('test-jwt-token'),
};

describe('AuthService', () => {
  let service: AuthService;
  let prisma: typeof mockPrisma;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get(PrismaService);

    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'user-1',
        name: 'Test User',
        email: 'test@lejel.com',
        role: 'Editor',
      });

      const result = await service.register({
        name: 'Test User',
        email: 'test@lejel.com',
        password: 'password123',
        role: 'Editor',
      });

      expect(result).toEqual({
        id: 'user-1',
        name: 'Test User',
        email: 'test@lejel.com',
        role: 'Editor',
      });
      expect(prisma.user.create).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException for invalid role', async () => {
      await expect(
        service.register({
          name: 'Test',
          email: 'test@lejel.com',
          password: 'password123',
          role: 'InvalidRole' as any,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ConflictException for existing email', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.register({
          name: 'Test',
          email: 'test@lejel.com',
          password: 'password123',
          role: 'Editor',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should login successfully and return token', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        name: 'Test User',
        email: 'test@lejel.com',
        passwordHash: '$2a$12$abcdefghijklmnopqrstuvwx',
        role: 'Editor',
      });

      const bcryptjs = require('bcryptjs');
      jest.spyOn(bcryptjs, 'compare').mockResolvedValue(true);

      const result = await service.login({
        email: 'test@lejel.com',
        password: 'password123',
      });

      expect(result.accessToken).toBe('test-jwt-token');
      expect(result.user).toBeDefined();
    });

    it('should throw UnauthorizedException for wrong email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'wrong@lejel.com', password: 'password123' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        passwordHash: 'hashed',
      });

      const bcryptjs = require('bcryptjs');
      jest.spyOn(bcryptjs, 'compare').mockResolvedValue(false);

      await expect(
        service.login({ email: 'test@lejel.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('me', () => {
    it('should return current user profile', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        name: 'Test User',
        email: 'test@lejel.com',
        role: 'Editor',
      });

      const result = await service.me('user-1');

      expect(result.name).toBe('Test User');
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.me('non-existent')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
