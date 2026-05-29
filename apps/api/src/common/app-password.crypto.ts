import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import type { ConfigService } from '@nestjs/config';

const PREFIX = 'enc:v1';

function keyFromSecret(secret: string): Buffer {
  if (!secret.trim()) {
    throw new Error('App password encryption secret is empty');
  }
  return createHash('sha256').update(secret).digest();
}

export function appPasswordSecret(config: ConfigService): string {
  return (
    config.get<string>('NC_APP_PASSWORD_ENCRYPTION_KEY') ??
    config.getOrThrow<string>('JWT_SECRET')
  );
}

export function encryptAppPassword(plaintext: string, secret: string): string {
  if (plaintext.startsWith(`${PREFIX}:`)) return plaintext;

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFromSecret(secret), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    PREFIX,
    iv.toString('base64'),
    tag.toString('base64'),
    encrypted.toString('base64')
  ].join(':');
}

export function decryptAppPassword(value: string, secret: string): string {
  if (!value.startsWith(`${PREFIX}:`)) return value;

  const parts = value.split(':');
  if (parts.length !== 5) {
    throw new Error('Invalid encrypted app password format');
  }

  const [, version, iv64, tag64, encrypted64] = parts;
  if (version !== 'v1') {
    throw new Error(`Unsupported encrypted app password version: ${version}`);
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    keyFromSecret(secret),
    Buffer.from(iv64, 'base64')
  );
  decipher.setAuthTag(Buffer.from(tag64, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted64, 'base64')),
    decipher.final()
  ]).toString('utf8');
}
