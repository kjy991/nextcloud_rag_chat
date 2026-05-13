import {
  Controller,
  Get,
  Param,
  Post,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
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
}
