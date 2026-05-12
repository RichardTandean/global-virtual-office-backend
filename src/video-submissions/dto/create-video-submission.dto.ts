import { IsString, IsOptional } from 'class-validator';

export class CreateVideoSubmissionDto {
  @IsString()
  taskId: string;

  @IsString()
  fileUrl: string;

  @IsString()
  @IsOptional()
  fileSize?: string;
}
