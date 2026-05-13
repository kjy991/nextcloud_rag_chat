import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NextcloudService } from '../nextcloud/nextcloud.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nc: NextcloudService
  ) {}

  async getUsersUsage(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException(`Tenant ${tenantId} not found`);

    const quotas = await this.nc.getGroupMembers(tenant.ncGroupId);

    // Match NC users to internal users for email / userId
    const dbUsers = await this.prisma.user.findMany({ where: { tenantId } });
    const dbByNcId = new Map(dbUsers.map((u) => [u.ncUserId, u]));

    const users = quotas.map((q) => {
      const dbUser = dbByNcId.get(q.ncUserId);
      return {
        userId: dbUser?.id ?? q.ncUserId,
        email: dbUser?.email ?? q.email,
        usedBytes: q.usedBytes,
        quotaBytes: q.quotaBytes,
        usagePercent: q.usagePercent,
        lastCollectedAt: q.lastCollectedAt
      };
    });

    return { tenantId, users };
  }
}
