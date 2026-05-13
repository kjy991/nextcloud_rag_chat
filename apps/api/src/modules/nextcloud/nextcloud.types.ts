export interface NcUserQuota {
  ncUserId: string;
  email: string;
  displayName: string;
  usedBytes: number;
  quotaBytes: number;
  usagePercent: number;
  lastCollectedAt: string;
}

export interface NcFileEntry {
  name: string;
  path: string;
  size: number;
  mimeType: string;
  lastModified: string;
  isDirectory: boolean;
}
