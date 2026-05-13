import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { NextcloudService } from '../nextcloud/nextcloud.service';
import type { JwtPayload } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nc: NextcloudService,
    private readonly jwt: JwtService
  ) {}

  async login(ncUserId: string, password: string): Promise<{ accessToken: string }> {
    const valid = await this.nc.validateCredentials(ncUserId, password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const user = await this.prisma.user.findUnique({ where: { ncUserId } });
    if (!user) throw new UnauthorizedException('User not provisioned in this system');

    // Generate (or refresh) App Password for WebDAV operations
    const appPassword = await this.nc.generateAppPassword(ncUserId, password);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { ncAppPassword: appPassword }
    });

    const payload: JwtPayload = {
      sub: user.id,
      ncUserId: user.ncUserId,
      tenantId: user.tenantId,
      email: user.email
    };

    return { accessToken: this.jwt.sign(payload) };
  }
}
