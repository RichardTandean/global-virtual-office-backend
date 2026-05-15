import { Controller, Get, Post, UseGuards, Request } from '@nestjs/common';
import { TimeTrackerService } from './time-tracker.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('time-tracker')
export class TimeTrackerController {
  constructor(private readonly timeTrackerService: TimeTrackerService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async getStatus(@Request() req: any) {
    return this.timeTrackerService.getTodayStatus(req.user.sub);
  }

  @Get('today')
  @UseGuards(JwtAuthGuard)
  async getTodayAll() {
    return this.timeTrackerService.getTodayAll();
  }

  @Post('clock-in')
  @UseGuards(JwtAuthGuard)
  async clockIn(@Request() req: any) {
    return this.timeTrackerService.clockIn(req.user.sub);
  }

  @Post('clock-out')
  @UseGuards(JwtAuthGuard)
  async clockOut(@Request() req: any) {
    return this.timeTrackerService.clockOut(req.user.sub);
  }

  @Post('break-start')
  @UseGuards(JwtAuthGuard)
  async startBreak(@Request() req: any) {
    return this.timeTrackerService.startBreak(req.user.sub);
  }

  @Post('break-end')
  @UseGuards(JwtAuthGuard)
  async endBreak(@Request() req: any) {
    return this.timeTrackerService.endBreak(req.user.sub);
  }
}
