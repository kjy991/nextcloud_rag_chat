export type IndexStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface HealthResponse {
  status: 'ok';
  service: string;
  timestamp: string;
}

export interface TenantUsageUser {
  tenantId: string;
  userId: string;
  email: string;
  usedBytes: number;
  quotaBytes: number;
  usagePercent: number;
  lastCollectedAt: string;
}

export interface DocumentSource {
  fileName: string;
  pageNo: number;
  paragraphNo: number;
  text: string;
  bbox?: [number, number, number, number];
}
