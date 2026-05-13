import {
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { parseStringPromise } from 'xml2js';
import type { NcFileEntry, NcUserQuota } from './nextcloud.types';

@Injectable()
export class NextcloudService {
  private readonly log = new Logger(NextcloudService.name);
  private readonly http: AxiosInstance;
  private readonly baseUrl: string;
  private readonly adminUser: string;
  private readonly adminPass: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.getOrThrow<string>('NEXTCLOUD_BASE_URL');
    this.adminUser = config.getOrThrow<string>('NEXTCLOUD_ADMIN_USER');
    this.adminPass = config.getOrThrow<string>('NEXTCLOUD_ADMIN_PASSWORD');

    this.http = axios.create({
      auth: { username: this.adminUser, password: this.adminPass },
      headers: { 'OCS-APIREQUEST': 'true' },
      timeout: 15_000
    });
  }

  // ── OCS ─────────────────────────────────────────────────────────────────

  async validateCredentials(ncUserId: string, password: string): Promise<boolean> {
    try {
      const res = await axios.get(`${this.baseUrl}/ocs/v1.php/cloud/users/${ncUserId}`, {
        auth: { username: ncUserId, password },
        headers: { 'OCS-APIREQUEST': 'true' },
        params: { format: 'json' },
        timeout: 8_000
      });
      return res.data?.ocs?.meta?.statuscode === 100;
    } catch {
      return false;
    }
  }

  async generateAppPassword(ncUserId: string, password: string): Promise<string> {
    try {
      const res = await axios.post(
        `${this.baseUrl}/ocs/v2.php/core/apppassword`,
        null,
        {
          auth: { username: ncUserId, password },
          headers: { 'OCS-APIREQUEST': 'true' },
          params: { format: 'json' },
          timeout: 8_000
        }
      );
      return res.data?.ocs?.data?.apppassword as string;
    } catch (err) {
      this.log.warn(`App password generation failed for ${ncUserId}, using session password`);
      return password;
    }
  }

  async getUsersByGroup(groupId: string): Promise<string[]> {
    try {
      const res = await this.http.get(
        `${this.baseUrl}/ocs/v1.php/cloud/groups/${groupId}`,
        { params: { format: 'json' } }
      );
      const users: string[] = res.data?.ocs?.data?.users ?? [];
      return users;
    } catch (err: unknown) {
      this.throwIfNcError(err, `group ${groupId}`);
    }
  }

  async getUserQuota(ncUserId: string): Promise<NcUserQuota> {
    try {
      const res = await this.http.get(
        `${this.baseUrl}/ocs/v1.php/cloud/users/${ncUserId}`,
        { params: { format: 'json' } }
      );
      const data = res.data?.ocs?.data;
      const quota = data?.quota;

      const usedBytes: number = quota?.used ?? 0;
      const quotaBytes: number = quota?.quota > 0 ? quota.quota : 0;
      const usagePercent =
        quotaBytes > 0 ? Math.round((usedBytes / quotaBytes) * 100) : 0;

      return {
        ncUserId,
        email: data?.email ?? '',
        displayName: data?.displayname ?? ncUserId,
        usedBytes,
        quotaBytes,
        usagePercent,
        lastCollectedAt: new Date().toISOString()
      };
    } catch (err: unknown) {
      this.throwIfNcError(err, `user ${ncUserId}`);
    }
  }

  async getGroupMembers(groupId: string): Promise<NcUserQuota[]> {
    const userIds = await this.getUsersByGroup(groupId);
    return Promise.all(userIds.map((id) => this.getUserQuota(id)));
  }

  // ── WebDAV ───────────────────────────────────────────────────────────────

  async listFiles(ncUserId: string, folderPath = '/documents', ncPassword?: string): Promise<NcFileEntry[]> {
    const url = `${this.baseUrl}/remote.php/dav/files/${ncUserId}${folderPath}`;
    const body = `<?xml version="1.0"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:displayname/>
    <d:getcontenttype/>
    <d:getcontentlength/>
    <d:getlastmodified/>
    <d:resourcetype/>
  </d:prop>
</d:propfind>`;

    const authHttp = ncPassword
      ? axios.create({ auth: { username: ncUserId, password: ncPassword }, timeout: 15_000 })
      : this.http;

    try {
      const res = await authHttp.request({
        method: 'PROPFIND',
        url,
        data: body,
        headers: { 'Content-Type': 'application/xml', Depth: '1' },
        responseType: 'text'
      });

      const parsed = await parseStringPromise(res.data, { explicitArray: false });
      const responses = parsed['d:multistatus']?.['d:response'] ?? [];
      const items = Array.isArray(responses) ? responses : [responses];

      return items
        .slice(1) // skip parent folder entry
        .map((item) => {
          const props = item['d:propstat']?.['d:prop'] ?? {};
          const isDir = !!props['d:resourcetype']?.['d:collection'];
          const href: string = item['d:href'] ?? '';
          const name = href.split('/').filter(Boolean).pop() ?? '';

          return {
            name: decodeURIComponent(name),
            path: href,
            size: parseInt(props['d:getcontentlength'] ?? '0', 10),
            mimeType: props['d:getcontenttype'] ?? '',
            lastModified: props['d:getlastmodified'] ?? '',
            isDirectory: isDir
          };
        })
        .filter((f) => !f.isDirectory);
    } catch (err: unknown) {
      this.throwIfNcError(err, `list files for ${ncUserId}`);
    }
  }

  async uploadFile(
    ncUserId: string,
    folderPath: string,
    fileName: string,
    fileBuffer: Buffer,
    mimeType: string,
    ncPassword?: string
  ): Promise<string> {
    const ncPath = `${folderPath}/${fileName}`;
    const url = `${this.baseUrl}/remote.php/dav/files/${ncUserId}${ncPath}`;
    const authHttp = ncPassword
      ? axios.create({ auth: { username: ncUserId, password: ncPassword }, timeout: 60_000 })
      : this.http;

    try {
      await authHttp.put(url, fileBuffer, {
        headers: { 'Content-Type': mimeType }
      });
      return ncPath;
    } catch (err: unknown) {
      this.throwIfNcError(err, `upload ${fileName}`);
    }
  }

  async downloadFile(ncUserId: string, ncPath: string, ncPassword?: string): Promise<Buffer> {
    const url = `${this.baseUrl}/remote.php/dav/files/${ncUserId}${ncPath}`;
    const authHttp = ncPassword
      ? axios.create({ auth: { username: ncUserId, password: ncPassword }, timeout: 120_000 })
      : this.http;
    try {
      const res = await authHttp.get(url, { responseType: 'arraybuffer' });
      return Buffer.from(res.data as ArrayBuffer);
    } catch (err: unknown) {
      this.throwIfNcError(err, `download ${ncPath}`);
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private throwIfNcError(err: unknown, context: string): never {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      this.log.error(`Nextcloud error [${context}]: HTTP ${status ?? 'network'}`);
      if (status === 404) throw new NotFoundException(`Nextcloud: ${context} not found`);
    }
    this.log.error(`Nextcloud error [${context}]:`, err);
    throw new BadGatewayException('Nextcloud service unavailable');
  }
}
