import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';

export class CreateProgressDto {
  @IsString()
  taskId: string;

  @IsString()
  @IsOptional()
  fileUrl?: string;

  @IsInt()
  @Min(0)
  @Max(100)
  percent: number;

  @IsString()
  @IsOptional()
  note?: string;
}
