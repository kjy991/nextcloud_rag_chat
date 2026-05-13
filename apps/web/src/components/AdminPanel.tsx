import { useEffect, useState } from 'react';
import { type TenantUsageResponse, type UserUsage, getUsersUsage } from '../lib/api';

interface Props {
  currentTenantId: string;
}

function fmtBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function barColor(pct: number): string {
  if (pct >= 80) return '#e53e3e';
  if (pct >= 50) return '#d69e2e';
  return '#38a169';
}

export function AdminPanel({ currentTenantId }: Props) {
  const [tenantId, setTenantId] = useState(currentTenantId);
  const [data, setData] = useState<TenantUsageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load(tid: string) {
    setLoading(true);
    setError('');
    try {
      const res = await getUsersUsage(tid);
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '조회 실패');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(tenantId); }, [tenantId]);

  const tenants = ['tenant-a', 'tenant-b'];

  return (
    <section className="admin-panel" aria-label="관리자 사용량">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Admin</p>
          <h2>사용자 저장공간</h2>
        </div>
        <div className="admin-controls">
          <select value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
            {tenants.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <button type="button" onClick={() => void load(tenantId)} disabled={loading}>
            새로고침
          </button>
        </div>
      </div>

      {error && <p className="error-msg">{error}</p>}
      {loading && <p className="muted">로딩 중...</p>}

      {data && (
        <div className="usage-grid">
          {data.users.map((row: UserUsage) => (
            <article className="usage-row" key={row.userId}>
              <span className="usage-email">{row.email}</span>
              <span className="usage-numbers">
                {fmtBytes(row.usedBytes)} / {fmtBytes(row.quotaBytes)}
              </span>
              <div
                className="progress"
                aria-label={`${row.usagePercent}% 사용`}
                title={`${row.usagePercent}%`}
              >
                <div
                  style={{
                    width: `${Math.min(row.usagePercent, 100)}%`,
                    background: barColor(row.usagePercent)
                  }}
                />
              </div>
              <span className="usage-pct">{row.usagePercent}%</span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
