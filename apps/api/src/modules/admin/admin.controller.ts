import { Controller, Get, Param, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/auth.dto';
import { AdminService } from './admin.service';

interface RequestWithUser extends Request {
  user: AuthUser;
}

@UseGuards(JwtAuthGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('tenants/:tenantId/users-usage')
  getUsersUsage(@Param('tenantId') tenantId: string, @Request() req: RequestWithUser) {
    return this.admin.getUsersUsage(tenantId, req.user);
  }
}
