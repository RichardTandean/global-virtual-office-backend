import { IsString, IsOptional, IsEnum, IsISO8601, IsInt, Min, Max } from 'class-validator';
import { TaskStatus } from '@prisma/client';

export class CreateTaskDto {
  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  briefUrl?: string;

  @IsString()
  assignedTo: string;

  @IsISO8601()
  @IsOptional()
  deadline?: string;
}

export class UpdateTaskDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  briefUrl?: string;

  @IsString()
  @IsOptional()
  assignedTo?: string;

  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus;

  @IsISO8601()
  @IsOptional()
  deadline?: string;

  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  progressPercent?: number;
}
