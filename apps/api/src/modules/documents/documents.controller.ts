import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/auth.dto';
import { DocumentsService } from './documents.service';

interface RequestWithUser extends Request {
  user: AuthUser;
}

@UseGuards(JwtAuthGuard)
@Controller()
export class DocumentsController {
  constructor(private readonly docs: DocumentsService) {}

  @Post('tenants/:tenantId/files')
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(
    @Param('tenantId') tenantId: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: RequestWithUser
  ) {
    return this.docs.uploadFile(tenantId, req.user, file);
  }

  @Get('tenants/:tenantId/files')
  listFiles(
    @Param('tenantId') tenantId: string,
    @Request() req: RequestWithUser
  ) {
    return this.docs.listFiles(tenantId, req.user);
  }

  @Get('files/:fileId/index-status')
  getIndexStatus(@Param('fileId') fileId: string, @Request() req: RequestWithUser) {
    return this.docs.getIndexStatus(fileId, req.user.tenantId);
  }

  @Post('files/:fileId/retry-indexing')
  retryIndexing(@Param('fileId') fileId: string, @Request() req: RequestWithUser) {
    return this.docs.retryIndexing(fileId, req.user);
  }

  @Delete('files/:fileId')
  @HttpCode(204)
  deleteFile(@Param('fileId') fileId: string, @Request() req: RequestWithUser) {
    return this.docs.deleteFile(fileId, req.user);
  }

  @Delete('tenants/:tenantId/files/by-path')
  @HttpCode(204)
  deleteFileByPath(
    @Param('tenantId') tenantId: string,
    @Query('ncPath') ncPath: string,
    @Request() req: RequestWithUser
  ) {
    if (!ncPath) throw new BadRequestException('ncPath query param is required');
    return this.docs.deleteFileByPath(tenantId, req.user, ncPath);
  }

  @Get('files/:fileId/content')
  async getFileContent(
    @Param('fileId') fileId: string,
    @Request() req: RequestWithUser,
    @Res() res: Response
  ) {
    const { buffer, fileName } = await this.docs.getFileContent(fileId, req.user);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`,
      'Content-Length': buffer.length.toString(),
      'Cache-Control': 'private, max-age=300'
    });
    res.end(buffer);
  }
}
