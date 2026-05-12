import { IsString, IsOptional, IsInt, Min } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  taskId: string;

  @IsString()
  content: string;

  @IsString()
  @IsOptional()
  videoSubmissionId?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  timestampSeconds?: number;

  @IsString()
  @IsOptional()
  parentId?: string;
}
