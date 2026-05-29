import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

const TENANTS = [
  { id: 'tenant-a', name: 'Tenant A', ncGroupId: 'tenant-a' },
  { id: 'tenant-b', name: 'Tenant B', ncGroupId: 'tenant-b' },
];

const USERS: Array<{
  id: string;
  tenantId: string;
  email: string;
  ncUserId: string;
  role: UserRole;
}> = [
  { id: 'user-a1-id', tenantId: 'tenant-a', email: 'user-a1@datco.kr', ncUserId: 'user-a1', role: UserRole.ADMIN },
  { id: 'user-a2-id', tenantId: 'tenant-a', email: 'user-a2@datco.kr', ncUserId: 'user-a2', role: UserRole.USER },
  { id: 'user-a3-id', tenantId: 'tenant-a', email: 'user-a3@datco.kr', ncUserId: 'user-a3', role: UserRole.USER },
  { id: 'user-b1-id', tenantId: 'tenant-b', email: 'user-b1@datco.kr', ncUserId: 'user-b1', role: UserRole.ADMIN },
  { id: 'user-b2-id', tenantId: 'tenant-b', email: 'user-b2@datco.kr', ncUserId: 'user-b2', role: UserRole.USER },
  { id: 'user-b3-id', tenantId: 'tenant-b', email: 'user-b3@datco.kr', ncUserId: 'user-b3', role: UserRole.USER },
];

async function main(): Promise<void> {
  console.log('DB seed 시작...');

  for (const tenant of TENANTS) {
    await prisma.tenant.upsert({
      where: { id: tenant.id },
      update: { name: tenant.name },
      create: tenant,
    });
    console.log(`  tenant: ${tenant.id}`);
  }

  for (const user of USERS) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: { role: user.role, email: user.email },
      create: user,
    });
    console.log(`  user: ${user.ncUserId} (${user.role})`);
  }

  console.log('DB seed 완료.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
