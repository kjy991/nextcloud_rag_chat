import { Module } from '@nestjs/common';
import { NextcloudModule } from '../nextcloud/nextcloud.module';
import { QdrantService } from '../chat/qdrant.service';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [NextcloudModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, QdrantService]
})
export class DocumentsModule {}
