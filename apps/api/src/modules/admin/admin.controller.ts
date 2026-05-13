import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminService } from './admin.service';

@UseGuards(JwtAuthGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('tenants/:tenantId/users-usage')
  getUsersUsage(@Param('tenantId') tenantId: string) {
    return this.admin.getUsersUsage(tenantId);
  }
}
