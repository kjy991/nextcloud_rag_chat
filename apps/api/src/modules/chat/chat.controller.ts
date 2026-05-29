import { Body, Controller, HttpCode, Param, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/auth.dto';
import { ChatService } from './chat.service';
import { AskDto } from './chat.dto';

interface RequestWithUser extends Request {
  user: AuthUser;
}

@UseGuards(JwtAuthGuard)
@Controller('files')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post(':fileId/chat')
  @HttpCode(200)
  ask(
    @Param('fileId') fileId: string,
    @Body() dto: AskDto,
    @Request() req: RequestWithUser
  ) {
    return this.chat.askFile(fileId, dto.question, req.user);
  }
}
