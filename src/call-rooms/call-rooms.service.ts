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
    if (!user) throw new NotFoundException('errors.userNotFound');

    if (dto.type === 'meeting' && user.role !== 'Admin' && user.role !== 'KoreaTeam') {
      throw new BadRequestException('errors.onlyAdminKoreaCanCreateMeeting');
    }

    if (dto.type === 'direct') {
      if (!dto.inviteUserIds || dto.inviteUserIds.length !== 1) {
        throw new BadRequestException('errors.directCallRequiresOneInvitee');
      }
    }

    const isPublic = dto.type === 'breakout' ? (dto.isPublic ?? false) : false;
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;

    let roomName: string;
    if (dto.type === 'meeting') {
      roomName = `lejel-wfh-meeting-${Date.now()}`;
    } else if (dto.type === 'breakout') {
      roomName = `lejel-wfh-room-${Date.now()}`;
    } else if (dto.type === 'direct') {
      roomName = `lejel-wfh-direct-${Date.now()}`;
    } else {
      roomName = `lejel-wfh-private-${Date.now()}`;
    }

    const room = await this.prisma.callRoom.create({
      data: {
        name: dto.name,
        type: dto.type,
        roomName,
        createdBy: userId,
        isPublic,
        scheduledAt,
      },
      include: {
        creator: { select: { id: true, name: true } },
        _count: { select: { participants: true } },
      },
    });

    let inviteUserIds: string[] = [];

    if (dto.type === 'meeting') {
      if (dto.inviteUserIds && dto.inviteUserIds.length > 0) {
        inviteUserIds = dto.inviteUserIds;
      } else {
        const allUsers = await this.prisma.user.findMany({
          where: { id: { not: userId }, isActive: true },
          select: { id: true },
        });
        inviteUserIds = allUsers.map((u) => u.id);
      }
    } else if (dto.type === 'direct' && dto.inviteUserIds) {
      inviteUserIds = dto.inviteUserIds;
    } else if (dto.type === 'breakout' && dto.inviteUserIds?.length) {
      inviteUserIds = dto.inviteUserIds;
    } else if (dto.type === 'private' && dto.inviteUserIds?.length) {
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
        direct: 'Direct Call',
      };

      await this.notifications.createMany(
        inviteUserIds.map((invitedUserId) => ({
          userId: invitedUserId,
          type: 'call_invited' as const,
          titleKey: 'notifications.callInvite',
          bodyKey: 'notifications.callInviteBody',
          bodyParams: { name: user.name, type: roomTypeLabel[dto.type] ?? dto.type, roomName: dto.name },
        })),
      );
    }

    if (dto.type === 'meeting' && scheduledAt) {
      await this.prisma.calendarEvent.create({
        data: {
          title: dto.name,
          type: 'meeting',
          date: scheduledAt,
          endDate: scheduledAt,
          isAllDay: false,
          color: '#9333EA',
          createdBy: userId,
          callRoomId: room.id,
        },
      });
    }

    return room;
  }

  async findAll(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('errors.userNotFound');

    await this.findOrCreateOffice();

    const rooms = await this.prisma.callRoom.findMany({
      where: {
        isActive: true,
        OR: [
          { type: 'office' },
          { type: 'meeting' },
          { type: 'breakout', isPublic: true },
          { type: 'breakout', createdBy: userId },
          { type: 'breakout', invites: { some: { userId } } },
          { type: 'private', createdBy: userId },
          { type: 'private', invites: { some: { userId } } },
          { type: 'direct', createdBy: userId },
          { type: 'direct', invites: { some: { userId } } },
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

    if (!room) throw new NotFoundException('errors.roomNotFound');
    return room;
  }

  async join(id: string, userId: string) {
    const room = await this.prisma.callRoom.findUnique({ where: { id } });
    if (!room) throw new NotFoundException('errors.roomNotFound');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true },
    });
    if (!user) throw new NotFoundException('errors.userNotFound');

    const needsInvite =
      room.type === 'private' ||
      room.type === 'direct' ||
      (room.type === 'breakout' && !room.isPublic);

    if (needsInvite && room.createdBy !== userId) {
      const invite = await this.prisma.callRoomInvite.findUnique({
        where: { roomId_userId: { roomId: id, userId } },
      });
      if (!invite) throw new BadRequestException('errors.notInvitedToRoom');
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
        titleKey: 'notifications.participantJoined',
        bodyKey: 'notifications.participantJoinedBody',
        bodyParams: { name: user.name, roomName: room.name },
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

  async invite(id: string, inviteUserIds: string[], inviterId: string) {
    const room = await this.prisma.callRoom.findUnique({ where: { id } });
    if (!room) throw new NotFoundException('errors.roomNotFound');
    if (room.createdBy !== inviterId) throw new BadRequestException('errors.onlyCreatorCanInvite');

    const inviter = await this.prisma.user.findUnique({
      where: { id: inviterId },
      select: { name: true },
    });

    const existingInvites = await this.prisma.callRoomInvite.findMany({
      where: { roomId: id, userId: { in: inviteUserIds } },
      select: { userId: true },
    });
    const existingIds = new Set(existingInvites.map((i) => i.userId));
    const newIds = inviteUserIds.filter((uid) => !existingIds.has(uid));

    if (newIds.length > 0) {
      await Promise.all(
        newIds.map((uid) =>
          this.prisma.callRoomInvite.create({
            data: { roomId: id, userId: uid, invitedBy: inviterId },
          }),
        ),
      );

      this.eventEmitter.emit('call.invite', { room, invitedUserIds: newIds, invitedBy: inviter?.name });

      const roomTypeLabel: Record<string, string> = {
        meeting: 'Meeting',
        breakout: 'Breakout Room',
        private: 'Private Room',
        direct: 'Direct Call',
      };

      await this.notifications.createMany(
        newIds.map((uid) => ({
          userId: uid,
          type: 'call_invited' as const,
          titleKey: 'notifications.callInvite',
          bodyKey: 'notifications.callInviteBody',
          bodyParams: { name: inviter?.name, type: roomTypeLabel[room.type] ?? room.type, roomName: room.name },
        })),
      );
    }

    return room;
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
    if (!room) throw new NotFoundException('errors.roomNotFound');
    if (room.type === 'office') throw new BadRequestException('errors.officeRoomCannotDelete');
    if (room.createdBy !== userId) throw new BadRequestException('errors.onlyCreatorCanDeleteRoom');

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
          titleKey: 'notifications.roomClosed',
          bodyKey: 'notifications.roomClosedBody',
          bodyParams: { roomName: room.name },
        })),
      );
    }

    return { message: 'common.messages.roomDeleted' };
  }
}
