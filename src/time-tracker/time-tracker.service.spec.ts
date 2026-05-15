import { Test, TestingModule } from '@nestjs/testing';
import { TimeTrackerService } from './time-tracker.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';

const mockPrisma = {
  timeLog: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  task: {
    count: jest.fn().mockResolvedValue(0),
  },
};

describe('TimeTrackerService', () => {
  let service: TimeTrackerService;
  let prisma: typeof mockPrisma;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimeTrackerService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<TimeTrackerService>(TimeTrackerService);
    prisma = module.get(PrismaService);

    jest.clearAllMocks();
  });

  describe('getTodayStatus', () => {
    it('should return not clocked in when no logs exist', async () => {
      prisma.timeLog.findFirst.mockResolvedValue(null);
      prisma.timeLog.findMany.mockResolvedValue([]);

      const result = await service.getTodayStatus('user-1');

      expect(result.isClockedIn).toBe(false);
      expect(result.totalDurationMinutes).toBe(0);
    });

    it('should return clocked in when active log exists', async () => {
      const now = new Date();
      const log = {
        id: 'log-1',
        clockIn: now,
        clockOut: null,
        breakMinutesTotal: 0,
        breakStartedAt: null,
      };
      prisma.timeLog.findFirst.mockResolvedValue(log);
      prisma.timeLog.findMany.mockResolvedValue([
        {
          id: 'log-1',
          clockIn: now,
          clockOut: null,
          durationMinutes: null,
          breakMinutesTotal: 0,
          breakStartedAt: null,
        },
      ]);

      const result = await service.getTodayStatus('user-1');

      expect(result.isClockedIn).toBe(true);
      expect(result.isOnBreak).toBe(false);
      expect(result.totalDurationMinutes).toBeGreaterThanOrEqual(0);
    });
  });

  describe('clockIn', () => {
    it('should create a new time log', async () => {
      prisma.timeLog.findFirst.mockResolvedValue(null);
      prisma.timeLog.create.mockResolvedValue({
        id: 'log-1',
        userId: 'user-1',
        clockIn: new Date(),
      });

      const result = await service.clockIn('user-1');

      expect(result.isClockedIn).toBe(true);
      expect(prisma.timeLog.create).toHaveBeenCalled();
    });

    it('should throw BadRequestException if already clocked in', async () => {
      prisma.timeLog.findFirst.mockResolvedValue({
        id: 'log-1',
        clockOut: null,
      });

      await expect(service.clockIn('user-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('clockOut', () => {
    it('should update time log with clock out', async () => {
      const clockIn = new Date(Date.now() - 3600000); // 1 hour ago
      prisma.timeLog.findFirst.mockResolvedValue({
        id: 'log-1',
        clockIn,
        clockOut: null,
        breakMinutesTotal: 0,
        breakStartedAt: null,
      });
      prisma.timeLog.update.mockResolvedValue({
        id: 'log-1',
        clockIn,
        clockOut: new Date(),
        durationMinutes: 60,
      });

      const result = await service.clockOut('user-1');

      expect(result.isClockedIn).toBe(false);
      expect(result.timeLog.durationMinutes).toBe(60);
    });

    it('should throw BadRequestException if not clocked in', async () => {
      prisma.timeLog.findFirst.mockResolvedValue(null);

      await expect(service.clockOut('user-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
