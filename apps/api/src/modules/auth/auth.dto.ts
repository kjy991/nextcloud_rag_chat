import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  ncUserId: string;

  @IsString()
  @MinLength(1)
  password: string;
}

export interface JwtPayload {
  sub: string;       // internal user.id
  ncUserId: string;
  tenantId: string;
  email: string;
}

export interface AuthUser {
  id: string;
  ncUserId: string;
  tenantId: string;
  email: string;
}
