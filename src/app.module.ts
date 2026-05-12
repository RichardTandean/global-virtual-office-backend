import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { R2Module } from './r2/r2.module';
import { SseModule } from './sse/sse.module';
import { TimeTrackerModule } from './time-tracker/time-tracker.module';
import { UsersModule } from './users/users.module';
import { TasksModule } from './tasks/tasks.module';
import { VideoSubmissionsModule } from './video-submissions/video-submissions.module';
import { CommentsModule } from './comments/comments.module';
import { AssetsModule } from './assets/assets.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    PrismaModule,
    R2Module,
    SseModule,
    AuthModule,
    TimeTrackerModule,
    UsersModule,
    TasksModule,
    VideoSubmissionsModule,
    CommentsModule,
    AssetsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
