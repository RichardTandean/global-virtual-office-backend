import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { EventsService } from './events.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('events')
@UseGuards(JwtAuthGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  async findAll(@Query('month') month: string) {
    const m = month || new Date().toISOString().slice(0, 7);
    return this.eventsService.findAll(m);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('Admin')
  async create(
    @Body() body: {
      title: string;
      description?: string;
      type: 'holiday' | 'event' | 'meeting';
      date: string;
      endDate?: string;
      isAllDay?: boolean;
      color?: string;
    },
    @Request() req: any,
  ) {
    return this.eventsService.create(body, req.user.sub);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('Admin')
  async update(
    @Param('id') id: string,
    @Body() body: {
      title?: string;
      description?: string;
      type?: 'holiday' | 'event' | 'meeting';
      date?: string;
      endDate?: string | null;
      isAllDay?: boolean;
      color?: string | null;
    },
  ) {
    return this.eventsService.update(id, body);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('Admin')
  async remove(@Param('id') id: string) {
    return this.eventsService.remove(id);
  }
}
