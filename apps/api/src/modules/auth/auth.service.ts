import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { appPasswordSecret, encryptAppPassword } from '../../common/app-password.crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NextcloudService } from '../nextcloud/nextcloud.service';
import type { JwtPayload } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nc: NextcloudService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService
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
      data: { ncAppPassword: encryptAppPassword(appPassword, appPasswordSecret(this.config)) }
    });

    const payload: JwtPayload = {
      sub: user.id,
      ncUserId: user.ncUserId,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role as JwtPayload['role']
    };

    return { accessToken: this.jwt.sign(payload) };
  }
}
