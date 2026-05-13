import { Module } from '@nestjs/common';
import { NextcloudModule } from '../nextcloud/nextcloud.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [NextcloudModule],
  controllers: [DocumentsController],
  providers: [DocumentsService]
})
export class DocumentsModule {}
