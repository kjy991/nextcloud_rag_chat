import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChatService } from '../src/modules/chat/chat.service';
import type { AuthUser } from '../src/modules/auth/auth.dto';

const authUser: AuthUser = {
  id: 'user-a1',
  ncUserId: 'user-a1',
  tenantId: 'tenant-a',
  email: 'user-a1@datco.kr',
  role: 'USER'
};

const mockDoc = {
  id: 'doc-1',
  tenantId: 'tenant-a',
  ownerUserId: 'user-a1',
  fileName: 'contract.pdf',
  indexStatus: 'COMPLETED'
};

const mockSession = { id: 'session-1' };

function createService() {
  const prisma = {
    document: { findFirst: jest.fn() },
    chatSession: { findFirst: jest.fn(), create: jest.fn() },
    chatMessage: { create: jest.fn() }
  };
  const ollama = { embed: jest.fn(), chat: jest.fn() };
  const qdrant = { search: jest.fn() };

  return {
    service: new ChatService(prisma as never, ollama as never, qdrant as never),
    prisma,
    ollama,
    qdrant
  };
}

describe('ChatService', () => {
  describe('세션 재사용', () => {
    it('기존 세션이 있으면 재사용하고 새 세션을 생성하지 않는다', async () => {
      const { service, prisma, ollama, qdrant } = createService();

      prisma.document.findFirst.mockResolvedValue(mockDoc);
      prisma.chatSession.findFirst.mockResolvedValue(mockSession); // 기존 세션 존재
      prisma.chatMessage.create.mockResolvedValue({});
      ollama.embed.mockResolvedValue([0.1, 0.2]);
      qdrant.search.mockResolvedValue([]);

      await service.askFile('doc-1', '질문', authUser);

      expect(prisma.chatSession.findFirst).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-a', userId: 'user-a1', documentId: 'doc-1' }
      });
      expect(prisma.chatSession.create).not.toHaveBeenCalled();
    });

    it('기존 세션이 없으면 새 세션을 생성한다', async () => {
      const { service, prisma, ollama, qdrant } = createService();

      prisma.document.findFirst.mockResolvedValue(mockDoc);
      prisma.chatSession.findFirst.mockResolvedValue(null); // 세션 없음
      prisma.chatSession.create.mockResolvedValue(mockSession);
      prisma.chatMessage.create.mockResolvedValue({});
      ollama.embed.mockResolvedValue([0.1, 0.2]);
      qdrant.search.mockResolvedValue([]);

      await service.askFile('doc-1', '질문', authUser);

      expect(prisma.chatSession.findFirst).toHaveBeenCalled();
      expect(prisma.chatSession.create).toHaveBeenCalledWith({
        data: { tenantId: 'tenant-a', userId: 'user-a1', documentId: 'doc-1' }
      });
    });
  });

  describe('권한 검증', () => {
    it('존재하지 않는 문서 접근 시 NotFoundException을 던진다', async () => {
      const { service, prisma } = createService();
      prisma.document.findFirst.mockResolvedValue(null);

      await expect(service.askFile('doc-x', '질문', authUser))
        .rejects.toBeInstanceOf(NotFoundException);
    });

    it('소유자가 아닌 사용자 접근 시 ForbiddenException을 던진다', async () => {
      const { service, prisma } = createService();
      prisma.document.findFirst.mockResolvedValue({
        ...mockDoc,
        ownerUserId: 'user-a2' // 다른 소유자
      });

      await expect(service.askFile('doc-1', '질문', authUser))
        .rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('근거 없는 질문 처리', () => {
    it('검색 결과가 없으면 "문서에서 확인 불가"를 반환한다', async () => {
      const { service, prisma, ollama, qdrant } = createService();

      prisma.document.findFirst.mockResolvedValue(mockDoc);
      prisma.chatSession.findFirst.mockResolvedValue(mockSession);
      prisma.chatMessage.create.mockResolvedValue({});
      ollama.embed.mockResolvedValue([0.1, 0.2]);
      qdrant.search.mockResolvedValue([]); // 검색 결과 없음

      const result = await service.askFile('doc-1', '오늘 서울 날씨?', authUser);

      expect(result.answer).toBe('문서에서 확인 불가');
      expect(result.sources).toHaveLength(0);
      expect(ollama.chat).not.toHaveBeenCalled();
    });

    it('score 임계값 미만이면 "문서에서 확인 불가"를 반환한다', async () => {
      const { service, prisma, ollama, qdrant } = createService();

      prisma.document.findFirst.mockResolvedValue(mockDoc);
      prisma.chatSession.findFirst.mockResolvedValue(mockSession);
      prisma.chatMessage.create.mockResolvedValue({});
      ollama.embed.mockResolvedValue([0.1, 0.2]);
      qdrant.search.mockResolvedValue([
        { score: 0.1, fileName: 'contract.pdf', pageNo: 1, paragraphNo: 1, text: '내용', bbox: null, chunkId: 'c1', documentId: 'doc-1' }
      ]); // score < 0.3

      const result = await service.askFile('doc-1', '관련 없는 질문', authUser);

      expect(result.answer).toBe('문서에서 확인 불가');
      expect(ollama.chat).not.toHaveBeenCalled();
    });
  });
});
