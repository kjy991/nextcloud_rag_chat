import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { appPasswordSecret, decryptAppPassword } from '../../common/app-password.crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NextcloudService } from '../nextcloud/nextcloud.service';
import { QdrantService } from '../chat/qdrant.service';
import type { AuthUser } from '../auth/auth.dto';

const NC_FOLDER = '/documents';
const MAX_FILE_SIZE = 200 * 1024 * 1024;

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nc: NextcloudService,
    private readonly qdrant: QdrantService,
    private readonly config: ConfigService
  ) {}

  private async getNcPassword(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.ncAppPassword) throw new InternalServerErrorException('NC credentials not found — please re-login');
    return decryptAppPassword(user.ncAppPassword, appPasswordSecret(this.config));
  }

  async uploadFile(tenantId: string, user: AuthUser, file: Express.Multer.File) {
    this.assertSameTenant(tenantId, user.tenantId);
    if (!file) throw new BadRequestException('No file provided');
    if (file.mimetype !== 'application/pdf') throw new BadRequestException('Only PDF files are supported');
    if (file.size > MAX_FILE_SIZE) throw new BadRequestException('File exceeds 200 MB limit');

    // Multer parses multipart filenames as latin1 — re-encode to utf-8
    const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8');

    const ncPassword = await this.getNcPassword(user.id);

    const ncPath = await this.nc.uploadFile(
      user.ncUserId, NC_FOLDER, fileName, file.buffer, file.mimetype, ncPassword
    );

    const doc = await this.prisma.document.create({
      data: {
        tenantId,
        ownerUserId: user.id,
        fileName,
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
      const ncPath = decodeURIComponent(
        f.path.replace(`/remote.php/dav/files/${user.ncUserId}`, '').replace(/\/$/, '')
      );
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

  async retryIndexing(fileId: string, user: AuthUser) {
    const doc = await this.prisma.document.findFirst({
      where: { id: fileId, tenantId: user.tenantId }
    });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.ownerUserId !== user.id) throw new ForbiddenException('Access denied to this document');
    if (doc.indexStatus !== 'FAILED') {
      throw new BadRequestException('Only failed documents can be retried');
    }

    const updated = await this.prisma.document.update({
      where: { id: fileId },
      data: {
        indexStatus: 'PENDING',
        pageCount: null,
        chunkCount: null,
        indexedAt: null
      }
    });

    return {
      fileId: updated.id,
      tenantId: updated.tenantId,
      fileName: updated.fileName,
      indexStatus: updated.indexStatus
    };
  }

  async deleteFile(fileId: string, user: AuthUser): Promise<void> {
    const doc = await this.prisma.document.findFirst({
      where: { id: fileId, tenantId: user.tenantId }
    });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.ownerUserId !== user.id) throw new ForbiddenException('Access denied to this document');

    const ncPassword = await this.getNcPassword(user.id);

    await Promise.all([
      this.nc.deleteFile(user.ncUserId, doc.ncPath, ncPassword),
      this.qdrant.deleteByDocument(fileId)
    ]);

    await this.prisma.document.delete({ where: { id: fileId } });
  }

  async deleteFileByPath(tenantId: string, user: AuthUser, ncPath: string): Promise<void> {
    this.assertSameTenant(tenantId, user.tenantId);

    const ncPassword = await this.getNcPassword(user.id);

    // DB 레코드가 있으면 Qdrant + DB도 함께 삭제
    const doc = await this.prisma.document.findFirst({
      where: { ncPath, tenantId, ownerUserId: user.id }
    });

    await this.nc.deleteFile(user.ncUserId, ncPath, ncPassword);

    if (doc) {
      await Promise.all([
        this.qdrant.deleteByDocument(doc.id),
        this.prisma.document.delete({ where: { id: doc.id } })
      ]);
    }
  }

  async getFileContent(fileId: string, user: AuthUser): Promise<{ buffer: Buffer; fileName: string }> {
    const doc = await this.prisma.document.findFirst({
      where: { id: fileId, tenantId: user.tenantId, ownerUserId: user.id }
    });
    if (!doc) throw new NotFoundException('Document not found');

    const ncPassword = await this.getNcPassword(user.id);
    const buffer = await this.nc.downloadFile(user.ncUserId, doc.ncPath, ncPassword);
    return { buffer, fileName: doc.fileName };
  }

  private assertSameTenant(routeTenantId: string, userTenantId: string): void {
    if (routeTenantId !== userTenantId) throw new ForbiddenException('Access denied to this tenant');
  }
}
