import { IsString, IsEnum, IsOptional, IsArray } from 'class-validator';
import { CallRoomType } from '@prisma/client';

export class CreateCallRoomDto {
  @IsString()
  name: string;

  @IsEnum(CallRoomType)
  type: CallRoomType;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  inviteUserIds?: string[];
}
