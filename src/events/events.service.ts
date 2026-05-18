import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EventsService {
  constructor(private prisma: PrismaService) {}

  async findAll(month: string) {
    const [year, m] = month.split('-').map(Number);
    const start = new Date(year, m - 1, 1);
    const end = new Date(year, m, 0);
    // extend range to catch multi-day events that overlap
    const paddedStart = new Date(start);
    paddedStart.setDate(paddedStart.getDate() - 7);
    const paddedEnd = new Date(end);
    paddedEnd.setDate(paddedEnd.getDate() + 7);

    return this.prisma.calendarEvent.findMany({
      where: {
        OR: [
          { date: { gte: paddedStart, lte: paddedEnd } },
          { endDate: { gte: paddedStart, lte: paddedEnd } },
          { endDate: null, date: { gte: paddedStart, lte: paddedEnd } },
        ],
      },
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        date: true,
        endDate: true,
        isAllDay: true,
        color: true,
        createdBy: true,
      },
      orderBy: { date: 'asc' },
    });
  }

  async create(data: {
    title: string;
    description?: string;
    type: 'holiday' | 'event' | 'meeting';
    date: string;
    endDate?: string;
    isAllDay?: boolean;
    color?: string;
  }, userId: string) {
    return this.prisma.calendarEvent.create({
      data: {
        title: data.title,
        description: data.description,
        type: data.type,
        date: new Date(data.date),
        endDate: data.endDate ? new Date(data.endDate) : null,
        isAllDay: data.isAllDay ?? true,
        color: data.color,
        createdBy: userId,
      },
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        date: true,
        endDate: true,
        isAllDay: true,
        color: true,
        createdBy: true,
      },
    });
  }

  async update(id: string, data: {
    title?: string;
    description?: string;
    type?: 'holiday' | 'event' | 'meeting';
    date?: string;
    endDate?: string | null;
    isAllDay?: boolean;
    color?: string | null;
  }) {
    const event = await this.prisma.calendarEvent.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event tidak ditemukan');

    return this.prisma.calendarEvent.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.date !== undefined && { date: new Date(data.date) }),
        ...(data.endDate !== undefined && { endDate: data.endDate ? new Date(data.endDate) : null }),
        ...(data.isAllDay !== undefined && { isAllDay: data.isAllDay }),
        ...(data.color !== undefined && { color: data.color }),
      },
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        date: true,
        endDate: true,
        isAllDay: true,
        color: true,
        createdBy: true,
      },
    });
  }

  async remove(id: string) {
    const event = await this.prisma.calendarEvent.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event tidak ditemukan');

    await this.prisma.calendarEvent.delete({ where: { id } });
    return { message: 'Event berhasil dihapus' };
  }
}
