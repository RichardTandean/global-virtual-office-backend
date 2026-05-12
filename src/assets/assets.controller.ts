import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AssetsService } from './assets.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UploadAssetUrlDto, ConfirmAssetDto } from './dto/create-asset.dto';

@Controller('assets')
@UseGuards(JwtAuthGuard)
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Post('upload-url')
  async generateUploadUrl(@Body() dto: UploadAssetUrlDto, @Request() req: any) {
    return this.assetsService.generateUploadUrl(dto, req.user.sub);
  }

  @Post('confirm')
  async confirmUpload(@Body() dto: ConfirmAssetDto, @Request() req: any) {
    return this.assetsService.confirmUpload(dto, req.user.sub);
  }

  @Get('task/:taskId')
  async findByTask(@Param('taskId') taskId: string, @Request() req: any) {
    return this.assetsService.findByTask(taskId, req.user.sub);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req: any) {
    return this.assetsService.remove(id, req.user.sub, req.user.role);
  }
}
