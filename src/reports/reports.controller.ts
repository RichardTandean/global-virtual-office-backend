import {
  Controller,
  Get,
  Header,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  private parseWeekStart(weekStart?: string): Date {
    if (weekStart) {
      const d = new Date(weekStart);
      if (!Number.isNaN(d.valueOf())) return d;
    }
    return new Date();
  }

  @Get('weekly')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Admin')
  async weekly(@Query('weekStart') weekStart?: string) {
    const date = this.parseWeekStart(weekStart);
    const rows = await this.reports.getWeekly(date);
    return {
      weekStart: this.reports.startOfIsoWeek(date),
      rows,
    };
  }

  @Get('weekly/me')
  @UseGuards(JwtAuthGuard)
  async weeklyMe(@Request() req: any, @Query('weekStart') weekStart?: string) {
    const date = this.parseWeekStart(weekStart);
    return this.reports.getWeeklyForUser(req.user.sub, date);
  }

  @Get('weekly.csv')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Admin')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async weeklyCsv(
    @Query('weekStart') weekStart: string | undefined,
    @Res() res: Response,
  ) {
    const date = this.parseWeekStart(weekStart);
    const rows = await this.reports.getWeekly(date);
    const start = this.reports.startOfIsoWeek(date);
    const filename = `weekly-${start.toISOString().slice(0, 10)}.csv`;
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    res.send(this.reports.toCsv(rows));
  }
}
