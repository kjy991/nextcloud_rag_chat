import { ForbiddenException } from '@nestjs/common';
import { AdminService } from '../src/modules/admin/admin.service';
import type { AuthUser } from '../src/modules/auth/auth.dto';

describe('AdminService', () => {
  const adminUser: AuthUser = {
    id: 'user-a1',
    ncUserId: 'user-a1',
    tenantId: 'tenant-a',
    email: 'user-a1@datco.kr',
    role: 'ADMIN'
  };

  const regularUser: AuthUser = {
    id: 'user-a2',
    ncUserId: 'user-a2',
    tenantId: 'tenant-a',
    email: 'user-a2@datco.kr',
    role: 'USER'
  };

  function createService() {
    const prisma = {
      tenant: { findUnique: jest.fn() },
      user: { findMany: jest.fn() }
    };
    const nextcloud = {
      getGroupMembers: jest.fn()
    };

    return {
      service: new AdminService(prisma as never, nextcloud as never),
      prisma,
      nextcloud
    };
  }

  type UsageMethod = { getUsersUsage: (tenantId: string, user: AuthUser) => Promise<unknown> };

  it('일반 사용자(USER)는 관리자 API 접근 시 ForbiddenException을 던진다', async () => {
    const { service, nextcloud } = createService();

    await expect(
      (service as unknown as UsageMethod).getUsersUsage('tenant-a', regularUser)
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(nextcloud.getGroupMembers).not.toHaveBeenCalled();
  });

  it('관리자(ADMIN)가 다른 tenant 조회 시 ForbiddenException을 던진다', async () => {
    const { service, prisma, nextcloud } = createService();
    prisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-b', ncGroupId: 'tenant-b' });
    prisma.user.findMany.mockResolvedValue([]);
    nextcloud.getGroupMembers.mockResolvedValue([]);

    await expect(
      (service as unknown as UsageMethod).getUsersUsage('tenant-b', adminUser)
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(nextcloud.getGroupMembers).not.toHaveBeenCalled();
  });
});
