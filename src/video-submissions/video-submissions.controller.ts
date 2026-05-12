import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import { VideoSubmissionsService } from './video-submissions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UploadUrlDto, ConfirmUploadDto, UpdateVideoStatusDto } from './dto/video.dto';

@Controller('video-submissions')
@UseGuards(JwtAuthGuard)
export class VideoSubmissionsController {
  constructor(private readonly videoSubmissionsService: VideoSubmissionsService) {}

  @Post('upload-url')
  async generateUploadUrl(@Body() dto: UploadUrlDto, @Request() req: any) {
    return this.videoSubmissionsService.generateUploadUrl(dto, req.user.sub);
  }

  @Post('confirm')
  async confirmUpload(@Body() dto: ConfirmUploadDto, @Request() req: any) {
    return this.videoSubmissionsService.confirmUpload(dto, req.user.sub);
  }

  @Get('task/:taskId')
  async findByTask(@Param('taskId') taskId: string) {
    return this.videoSubmissionsService.findByTask(taskId);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles('KoreaTeam', 'Admin')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateVideoStatusDto,
    @Request() req: any,
  ) {
    return this.videoSubmissionsService.updateStatus(id, dto, req.user.sub, req.user.role);
  }

  @Get(':id/view-url')
  async getViewUrl(@Param('id') id: string) {
    return this.videoSubmissionsService.getViewUrl(id);
  }
}
