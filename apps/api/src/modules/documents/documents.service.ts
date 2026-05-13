import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NextcloudService } from '../nextcloud/nextcloud.service';
import type { AuthUser } from '../auth/auth.dto';

const NC_FOLDER = '/documents';
const MAX_FILE_SIZE = 200 * 1024 * 1024;

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nc: NextcloudService
  ) {}

  private async getNcPassword(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.ncAppPassword) throw new InternalServerErrorException('NC credentials not found — please re-login');
    return user.ncAppPassword;
  }

  async uploadFile(tenantId: string, user: AuthUser, file: Express.Multer.File) {
    this.assertSameTenant(tenantId, user.tenantId);
    if (!file) throw new BadRequestException('No file provided');
    if (file.mimetype !== 'application/pdf') throw new BadRequestException('Only PDF files are supported');
    if (file.size > MAX_FILE_SIZE) throw new BadRequestException('File exceeds 200 MB limit');

    const ncPassword = await this.getNcPassword(user.id);

    const ncPath = await this.nc.uploadFile(
      user.ncUserId, NC_FOLDER, file.originalname, file.buffer, file.mimetype, ncPassword
    );

    const doc = await this.prisma.document.create({
      data: {
        tenantId,
        ownerUserId: user.id,
        fileName: file.originalname,
        ncPath,
        mimeType: file.mimetype,
        fileSize: file.size,
        indexStatus: 'PENDING'
      }
    });

    return {
      fileId: doc.id,
      tenantId: doc.tenantId,
      fileName: doc.fileName,
      nextcloudPath: doc.ncPath,
      indexStatus: doc.indexStatus
    };
  }

  async listFiles(tenantId: string, user: AuthUser) {
    this.assertSameTenant(tenantId, user.tenantId);

    const ncPassword = await this.getNcPassword(user.id);

    const [ncFiles, dbDocs] = await Promise.all([
      this.nc.listFiles(user.ncUserId, NC_FOLDER, ncPassword),
      this.prisma.document.findMany({
        where: { tenantId, ownerUserId: user.id },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    const dbByPath = new Map(dbDocs.map((d) => [d.ncPath, d]));

    return ncFiles.map((f) => {
      const ncPath = f.path
        .replace(`/remote.php/dav/files/${user.ncUserId}`, '')
        .replace(/\/$/, '');
      const doc = dbByPath.get(ncPath);
      return {
        fileId: doc?.id ?? null,
        fileName: f.name,
        ncPath,
        fileSize: f.size,
        lastModified: f.lastModified,
        indexStatus: doc?.indexStatus ?? 'PENDING',
        pageCount: doc?.pageCount ?? null,
        chunkCount: doc?.chunkCount ?? null
      };
    });
  }

  async getIndexStatus(fileId: string, tenantId: string) {
    const doc = await this.prisma.document.findFirst({ where: { id: fileId, tenantId } });
    if (!doc) throw new NotFoundException('Document not found');
    return {
      fileId: doc.id,
      status: doc.indexStatus,
      pageCount: doc.pageCount,
      chunkCount: doc.chunkCount,
      indexedAt: doc.indexedAt
    };
  }

  private assertSameTenant(routeTenantId: string, userTenantId: string): void {
    if (routeTenantId !== userTenantId) throw new ForbiddenException('Access denied to this tenant');
  }
}
