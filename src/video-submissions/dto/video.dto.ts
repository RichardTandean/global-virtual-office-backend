import { IsString, IsOptional, IsEnum } from 'class-validator';
import { VideoStatus } from '@prisma/client';

export class UploadUrlDto {
  @IsString()
  fileName: string;

  @IsString()
  contentType: string;

  @IsString()
  taskId: string;
}

export class ConfirmUploadDto {
  @IsString()
  taskId: string;

  @IsString()
  key: string;

  @IsString()
  @IsOptional()
  fileSize?: string;
}

export class UpdateVideoStatusDto {
  @IsEnum(VideoStatus)
  status: VideoStatus;
}
