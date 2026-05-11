import { Test, TestingModule } from '@nestjs/testing';
import { TimeTrackerController } from './time-tracker.controller';
import { TimeTrackerService } from './time-tracker.service';

const mockTimeTrackerService = {
  getTodayStatus: jest.fn(),
  clockIn: jest.fn(),
  clockOut: jest.fn(),
};

describe('TimeTrackerController', () => {
  let controller: TimeTrackerController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TimeTrackerController],
      providers: [
        { provide: TimeTrackerService, useValue: mockTimeTrackerService },
      ],
    }).compile();

    controller = module.get<TimeTrackerController>(TimeTrackerController);
    jest.clearAllMocks();
  });

  it('should get today status', async () => {
    const req = { user: { sub: 'user-1' } };
    const expected = { isClockedIn: false, todayLogs: [] };
    mockTimeTrackerService.getTodayStatus.mockResolvedValue(expected);

    const result = await controller.getStatus(req);
    expect(result).toEqual(expected);
  });

  it('should clock in', async () => {
    const req = { user: { sub: 'user-1' } };
    const expected = { isClockedIn: true };
    mockTimeTrackerService.clockIn.mockResolvedValue(expected);

    const result = await controller.clockIn(req);
    expect(result).toEqual(expected);
  });

  it('should clock out', async () => {
    const req = { user: { sub: 'user-1' } };
    const expected = { isClockedIn: false };
    mockTimeTrackerService.clockOut.mockResolvedValue(expected);

    const result = await controller.clockOut(req);
    expect(result).toEqual(expected);
  });
});
