import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OllamaService } from './ollama.service';
import { QdrantService } from './qdrant.service';
import type { AuthUser } from '../auth/auth.dto';
import type { ChatResponse, DocumentSource } from './chat.dto';

const SCORE_THRESHOLD = 0.3;
const NO_ANSWER = '문서에서 확인 불가';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ollama: OllamaService,
    private readonly qdrant: QdrantService
  ) {}

  async askFile(fileId: string, question: string, user: AuthUser): Promise<ChatResponse> {
    const doc = await this.prisma.document.findFirst({
      where: { id: fileId, tenantId: user.tenantId }
    });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.ownerUserId !== user.id) throw new ForbiddenException();

    // Create or reuse chat session
    const session = await this.prisma.chatSession.create({
      data: { tenantId: user.tenantId, userId: user.id, documentId: fileId }
    });

    // Save user message
    await this.prisma.chatMessage.create({
      data: { sessionId: session.id, role: 'user', message: question }
    });

    // RAG: embed → search → generate
    const queryVec = await this.ollama.embed(question);
    const hits = await this.qdrant.search(queryVec, user.tenantId, fileId);
    const relevant = hits.filter((h) => h.score >= SCORE_THRESHOLD);

    let answer: string;
    let sources: DocumentSource[] = [];

    if (relevant.length === 0) {
      answer = NO_ANSWER;
    } else {
      const context = relevant
        .map((h, i) => `[${i + 1}] (${h.fileName} p.${h.pageNo} §${h.paragraphNo})\n${h.text}`)
        .join('\n\n');

      const systemPrompt = `당신은 문서 기반 AI 어시스턴트입니다.
반드시 아래 제공된 문서 내용만 근거로 답변하세요.
문서에 없는 내용은 절대 일반 지식으로 보완하지 마세요.
근거가 없으면 정확히 "${NO_ANSWER}"라고만 답하세요.

[문서 내용]
${context}`;

      answer = await this.ollama.chat(systemPrompt, question);
      if (!answer.trim()) answer = NO_ANSWER;

      sources = relevant.map((h) => ({
        fileName: h.fileName,
        pageNo: h.pageNo,
        paragraphNo: h.paragraphNo,
        text: h.text.slice(0, 200),
        bbox: h.bbox
      }));
    }

    // Save assistant message
    await this.prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: 'assistant',
        message: answer,
        sourcesJson: sources.length > 0 ? (sources as object[]) : undefined
      }
    });

    return { answer, sources };
  }
}
