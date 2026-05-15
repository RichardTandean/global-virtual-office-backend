import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCallRoomDto } from './dto/create-call-room.dto';
import { CallRoomType } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class CallRoomsService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private notifications: NotificationsService,
  ) {}

  async findOrCreateOffice() {
    let room = await this.prisma.callRoom.findFirst({
      where: { type: 'office', isActive: true },
    });
    if (!room) {
      room = await this.prisma.callRoom.create({
        data: {
          name: 'Office',
          type: 'office',
          roomName: 'lejel-wfh-office',
          createdBy: (await this.prisma.user.findFirst({ where: { role: 'Admin' } }))!.id,
        },
      });
    }
    return room;
  }

  async create(dto: CreateCallRoomDto, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User tidak ditemukan');

    if (dto.type === 'meeting' && user.role !== 'Admin' && user.role !== 'KoreaTeam') {
      throw new BadRequestException('Hanya Admin dan Korea Team yang bisa membuat meeting');
    }

    let roomName: string;
    if (dto.type === 'meeting') {
      roomName = `lejel-wfh-meeting-${Date.now()}`;
    } else if (dto.type === 'breakout') {
      roomName = `lejel-wfh-room-${Date.now()}`;
    } else {
      roomName = `lejel-wfh-private-${Date.now()}`;
    }

    const room = await this.prisma.callRoom.create({
      data: {
        name: dto.name,
        type: dto.type,
        roomName,
        createdBy: userId,
      },
      include: {
        creator: { select: { id: true, name: true } },
        _count: { select: { participants: true } },
      },
    });

    let inviteUserIds: string[] = [];

    if (dto.type === 'meeting') {
      const allUsers = await this.prisma.user.findMany({
        where: { id: { not: userId } },
        select: { id: true },
      });
      inviteUserIds = allUsers.map((u) => u.id);
    } else if (dto.type === 'private' && dto.inviteUserIds?.length) {
      inviteUserIds = dto.inviteUserIds;
    } else if (dto.type === 'breakout' && dto.inviteUserIds?.length) {
      inviteUserIds = dto.inviteUserIds;
    }

    if (inviteUserIds.length > 0) {
      await Promise.all(
        inviteUserIds.map((invitedUserId) =>
          this.prisma.callRoomInvite.create({
            data: { roomId: room.id, userId: invitedUserId, invitedBy: userId },
          }),
        ),
      );

      this.eventEmitter.emit('call.invite', { room, invitedUserIds: inviteUserIds, invitedBy: user.name });

      const roomTypeLabel: Record<string, string> = {
        meeting: 'Meeting',
        breakout: 'Breakout Room',
        private: 'Private Room',
      };

      await this.notifications.createMany(
        inviteUserIds.map((invitedUserId) => ({
          userId: invitedUserId,
          type: 'call_invited' as const,
          title: 'Undangan panggilan',
          body: `${user.name} mengundang Anda ke ${roomTypeLabel[dto.type] ?? dto.type} "${dto.name}"`,
        })),
      );
    }

    return room;
  }

  async findAll(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User tidak ditemukan');

    await this.findOrCreateOffice();

    const rooms = await this.prisma.callRoom.findMany({
      where: {
        isActive: true,
        OR: [
          { type: 'office' },
          { type: 'breakout' },
          { type: 'meeting' },
          { createdBy: userId },
          { invites: { some: { userId } } },
        ],
      },
      include: {
        creator: { select: { id: true, name: true } },
        _count: { select: { participants: true } },
        participants: {
          where: { leftAt: null },
          include: { user: { select: { id: true, name: true } } },
        },
        invites: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
      orderBy: [{ type: 'asc' }, { createdAt: 'desc' }],
    });

    return rooms;
  }

  async findOne(id: string) {
    const room = await this.prisma.callRoom.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, name: true } },
        participants: {
          where: { leftAt: null },
          include: { user: { select: { id: true, name: true, role: true } } },
        },
        invites: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });

    if (!room) throw new NotFoundException('Room tidak ditemukan');
    return room;
  }

  async join(id: string, userId: string) {
    const room = await this.prisma.callRoom.findUnique({ where: { id } });
    if (!room) throw new NotFoundException('Room tidak ditemukan');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true },
    });
    if (!user) throw new NotFoundException('User tidak ditemukan');

    if (room.type === 'private') {
      if (room.createdBy !== userId) {
        const invite = await this.prisma.callRoomInvite.findUnique({
          where: { roomId_userId: { roomId: id, userId } },
        });
        if (!invite) throw new BadRequestException('Kamu tidak diundang ke room ini');
      }
    }

    const existing = await this.prisma.callParticipant.findFirst({
      where: { roomId: id, userId, leftAt: null },
    });
    if (existing) return existing;

    const participant = await this.prisma.callParticipant.create({
      data: { roomId: id, userId },
    });

    if (room.createdBy !== userId) {
      await this.notifications.create({
        userId: room.createdBy,
        type: 'call_invited',
        title: 'Peserta bergabung',
        body: `${user.name} bergabung ke "${room.name}"`,
      });
    }

    return participant;
  }

  async leave(id: string, userId: string) {
    const participant = await this.prisma.callParticipant.findFirst({
      where: { roomId: id, userId, leftAt: null },
      orderBy: { joinedAt: 'desc' },
    });

    if (!participant) return null;

    return this.prisma.callParticipant.update({
      where: { id: participant.id },
      data: { leftAt: new Date() },
    });
  }

  async remove(id: string, userId: string) {
    const room = await this.prisma.callRoom.findUnique({
      where: { id },
      include: {
        participants: {
          where: { leftAt: null },
          select: { userId: true },
        },
      },
    });
    if (!room) throw new NotFoundException('Room tidak ditemukan');
    if (room.type === 'office') throw new BadRequestException('Office room tidak bisa dihapus');
    if (room.createdBy !== userId) throw new BadRequestException('Hanya creator yang bisa menghapus room');

    await this.prisma.callRoom.update({
      where: { id },
      data: { isActive: false },
    });

    const participantIds = room.participants
      .map((p) => p.userId)
      .filter((uid) => uid !== userId);

    if (participantIds.length > 0) {
      await this.notifications.createMany(
        participantIds.map((uid) => ({
          userId: uid,
          type: 'call_invited' as const,
          title: 'Room ditutup',
          body: `"${room.name}" telah ditutup oleh host`,
        })),
      );
    }

    return { message: 'Room dihapus' };
  }
}
