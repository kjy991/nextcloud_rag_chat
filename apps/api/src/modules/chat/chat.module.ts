import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { OllamaService } from './ollama.service';
import { QdrantService } from './qdrant.service';

@Module({
  controllers: [ChatController],
  providers: [ChatService, OllamaService, QdrantService]
})
export class ChatModule {}
