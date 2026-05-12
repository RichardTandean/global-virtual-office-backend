import { IsString, IsOptional } from 'class-validator';

export class UploadAssetUrlDto {
  @IsString()
  fileName: string;

  @IsString()
  contentType: string;

  @IsString()
  taskId: string;
}

export class ConfirmAssetDto {
  @IsString()
  taskId: string;

  @IsString()
  key: string;

  @IsString()
  fileType: string;

  @IsString()
  @IsOptional()
  fileSize?: string;

  @IsString()
  @IsOptional()
  label?: string;
}
