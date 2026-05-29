import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthUser, JwtPayload } from './auth.dto';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET')
    });
  }

  validate(payload: JwtPayload): AuthUser {
    if (!payload.sub || !payload.tenantId) {
      throw new UnauthorizedException();
    }
    return {
      id: payload.sub,
      ncUserId: payload.ncUserId,
      tenantId: payload.tenantId,
      email: payload.email,
      role: payload.role ?? 'USER'
    };
  }
}
