import { Module } from '@nestjs/common';
import { NextcloudModule } from '../nextcloud/nextcloud.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [NextcloudModule],
  controllers: [AdminController],
  providers: [AdminService]
})
export class AdminModule {}
