const BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('access_token');
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>)
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!(init.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (res.status === 401) {
    localStorage.removeItem('access_token');
    window.location.href = '/login';
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((err as { message: string }).message ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Auth ─────────────────────────────────────────────────────────────────────
export async function login(ncUserId: string, password: string): Promise<string> {
  const data = await request<{ accessToken: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ ncUserId, password })
  });
  localStorage.setItem('access_token', data.accessToken);
  return data.accessToken;
}

export function logout(): void {
  localStorage.removeItem('access_token');
}

export function parseToken(): { tenantId: string; email: string; ncUserId: string; role: 'USER' | 'ADMIN' } | null {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return {
      tenantId: payload.tenantId,
      email: payload.email,
      ncUserId: payload.ncUserId,
      role: payload.role ?? 'USER'
    };
  } catch {
    return null;
  }
}

// ── Admin ─────────────────────────────────────────────────────────────────────
export interface UserUsage {
  userId: string;
  email: string;
  usedBytes: number;
  quotaBytes: number;
  usagePercent: number;
  lastCollectedAt: string;
}
export interface TenantUsageResponse {
  tenantId: string;
  users: UserUsage[];
}

export function getUsersUsage(tenantId: string): Promise<TenantUsageResponse> {
  return request<TenantUsageResponse>(`/admin/tenants/${tenantId}/users-usage`);
}

// ── Files ─────────────────────────────────────────────────────────────────────
export interface FileEntry {
  fileId: string | null;
  fileName: string;
  ncPath: string;
  fileSize: number;
  lastModified: string;
  indexStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  pageCount: number | null;
  chunkCount: number | null;
}

export function listFiles(tenantId: string): Promise<FileEntry[]> {
  return request<FileEntry[]>(`/tenants/${tenantId}/files`);
}

export async function uploadFile(tenantId: string, file: File): Promise<FileEntry> {
  const form = new FormData();
  form.append('file', file);
  return request<FileEntry>(`/tenants/${tenantId}/files`, { method: 'POST', body: form });
}

export interface IndexStatus {
  fileId: string;
  status: string;
  pageCount: number | null;
  chunkCount: number | null;
  indexedAt: string | null;
}

export function getIndexStatus(fileId: string): Promise<IndexStatus> {
  return request<IndexStatus>(`/files/${fileId}/index-status`);
}

export interface RetryIndexingResponse {
  fileId: string;
  tenantId: string;
  fileName: string;
  indexStatus: 'PENDING';
}

export function retryIndexing(fileId: string): Promise<RetryIndexingResponse> {
  return request<RetryIndexingResponse>(`/files/${fileId}/retry-indexing`, { method: 'POST' });
}

export function deleteFile(fileId: string): Promise<void> {
  return request<void>(`/files/${fileId}`, { method: 'DELETE' });
}

export function deleteFileByPath(tenantId: string, ncPath: string): Promise<void> {
  return request<void>(`/tenants/${tenantId}/files/by-path?ncPath=${encodeURIComponent(ncPath)}`, { method: 'DELETE' });
}

export async function getFileContent(fileId: string): Promise<ArrayBuffer> {
  const token = localStorage.getItem('access_token');
  const res = await fetch(`${BASE}/files/${fileId}/content`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (!res.ok) throw new Error('PDF 다운로드 실패');
  return res.arrayBuffer();
}

// ── Chat ─────────────────────────────────────────────────────────────────────
export interface DocumentSource {
  fileName: string;
  pageNo: number;
  paragraphNo: number;
  text: string;
  bbox: number[] | null;
}

export interface ChatResponse {
  answer: string;
  sources: DocumentSource[];
}

export function askFile(fileId: string, question: string): Promise<ChatResponse> {
  return request<ChatResponse>(`/files/${fileId}/chat`, {
    method: 'POST',
    body: JSON.stringify({ question })
  });
}
