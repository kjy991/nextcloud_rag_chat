import { decryptAppPassword, encryptAppPassword } from '../src/common/app-password.crypto';

describe('app password crypto', () => {
  it('round-trips encrypted app passwords without storing plaintext', () => {
    const encrypted = encryptAppPassword('app-password', 'shared-secret');

    expect(encrypted).toMatch(/^enc:v1:/);
    expect(encrypted).not.toContain('app-password');
    expect(decryptAppPassword(encrypted, 'shared-secret')).toBe('app-password');
  });

  it('keeps legacy plaintext values readable during migration', () => {
    expect(decryptAppPassword('legacy-app-password', 'shared-secret')).toBe('legacy-app-password');
  });
});
