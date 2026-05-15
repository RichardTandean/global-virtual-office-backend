import { Module } from '@nestjs/common';
import { CallRoomsController } from './call-rooms.controller';
import { CallRoomsService } from './call-rooms.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CallRoomsController],
  providers: [CallRoomsService],
  exports: [CallRoomsService],
})
export class CallRoomsModule {}
