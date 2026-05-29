import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DocumentsService } from '../src/modules/documents/documents.service';
import type { AuthUser } from '../src/modules/auth/auth.dto';

describe('DocumentsService', () => {
  const authUser: AuthUser = {
    id: 'user-a1',
    ncUserId: 'user-a1',
    tenantId: 'tenant-a',
    email: 'user-a1@datco.kr',
    role: 'USER'
  };

  const otherTenantUser: AuthUser = {
    id: 'user-b1',
    ncUserId: 'user-b1',
    tenantId: 'tenant-b',
    email: 'user-b1@datco.kr',
    role: 'USER'
  };

  const sameTenantOtherUser: AuthUser = {
    id: 'user-a2',
    ncUserId: 'user-a2',
    tenantId: 'tenant-a',
    email: 'user-a2@datco.kr',
    role: 'USER'
  };

  function createService() {
    const prisma = {
      document: {
        findFirst: jest.fn(),
        update: jest.fn()
      },
      user: {
        findUnique: jest.fn()
      }
    };
    const nextcloud = {
      downloadFile: jest.fn()
    };
    const qdrant = {
      deleteByDocument: jest.fn()
    };

    return {
      service: new DocumentsService(
        prisma as never,
        nextcloud as never,
        qdrant as never,
        { get: jest.fn(), getOrThrow: jest.fn().mockReturnValue('test-secret') } as never
      ),
      prisma,
      nextcloud
    };
  }

  // ── retryIndexing ─────────────────────────────────────────────────────────

  it('FAILED 문서를 PENDING으로 재처리한다', async () => {
    const { service, prisma } = createService();
    prisma.document.findFirst.mockResolvedValue({
      id: 'doc-1',
      tenantId: authUser.tenantId,
      ownerUserId: authUser.id,
      indexStatus: 'FAILED'
    });
    prisma.document.update.mockResolvedValue({
      id: 'doc-1',
      tenantId: authUser.tenantId,
      fileName: 'contract.pdf',
      indexStatus: 'PENDING',
      pageCount: null,
      chunkCount: null,
      indexedAt: null
    });

    const result = await (
      service as unknown as { retryIndexing: (fileId: string, user: AuthUser) => Promise<unknown> }
    ).retryIndexing('doc-1', authUser);

    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: 'doc-1' },
      data: {
        indexStatus: 'PENDING',
        pageCount: null,
        chunkCount: null,
        indexedAt: null
      }
    });
    expect(result).toMatchObject({
      fileId: 'doc-1',
      indexStatus: 'PENDING'
    });
  });

  it('다른 tenant 사용자의 문서 retry를 거부한다 (NotFoundException)', async () => {
    const { service, prisma } = createService();
    // tenantId 불일치 → findFirst가 null 반환
    prisma.document.findFirst.mockResolvedValue(null);

    await expect(
      (service as unknown as { retryIndexing: (fileId: string, user: AuthUser) => Promise<unknown> })
        .retryIndexing('doc-1', otherTenantUser)
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.document.update).not.toHaveBeenCalled();
  });

  it('같은 tenant지만 소유자가 아닌 경우 retry를 거부한다 (ForbiddenException)', async () => {
    const { service, prisma } = createService();
    prisma.document.findFirst.mockResolvedValue({
      id: 'doc-1',
      tenantId: 'tenant-a',
      ownerUserId: 'user-a1', // 소유자는 user-a1
      indexStatus: 'FAILED'
    });

    await expect(
      (service as unknown as { retryIndexing: (fileId: string, user: AuthUser) => Promise<unknown> })
        .retryIndexing('doc-1', sameTenantOtherUser) // user-a2가 시도
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.document.update).not.toHaveBeenCalled();
  });

  // ── getFileContent ────────────────────────────────────────────────────────

  it('소유자가 자신의 파일 content를 조회한다', async () => {
    const { service, prisma, nextcloud } = createService();
    prisma.document.findFirst.mockResolvedValue({
      id: 'doc-1',
      tenantId: 'tenant-a',
      ownerUserId: 'user-a1',
      ncPath: '/documents/contract.pdf',
      fileName: 'contract.pdf'
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-a1',
      ncAppPassword: 'app-pass'
    });
    nextcloud.downloadFile.mockResolvedValue(Buffer.from('pdf-bytes'));

    const result = await (
      service as unknown as {
        getFileContent: (fileId: string, user: AuthUser) => Promise<{ buffer: Buffer; fileName: string }>
      }
    ).getFileContent('doc-1', authUser);

    expect(result.fileName).toBe('contract.pdf');
    expect(result.buffer).toEqual(Buffer.from('pdf-bytes'));
  });

  it('다른 tenant 사용자의 파일 content 접근을 거부한다 (NotFoundException)', async () => {
    const { service, prisma } = createService();
    // ownerUserId + tenantId 불일치 → findFirst null
    prisma.document.findFirst.mockResolvedValue(null);

    await expect(
      (service as unknown as {
        getFileContent: (fileId: string, user: AuthUser) => Promise<unknown>
      }).getFileContent('doc-1', otherTenantUser)
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('같은 tenant지만 소유자가 아닌 사용자의 content 접근을 거부한다 (NotFoundException)', async () => {
    const { service, prisma } = createService();
    // ownerUserId가 user-a1인데 user-a2가 요청 → findFirst에 ownerUserId 필터로 null 반환
    prisma.document.findFirst.mockResolvedValue(null);

    await expect(
      (service as unknown as {
        getFileContent: (fileId: string, user: AuthUser) => Promise<unknown>
      }).getFileContent('doc-1', sameTenantOtherUser)
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
