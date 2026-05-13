import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../lib/api';

export function LoginPage() {
  const navigate = useNavigate();
  const [ncUserId, setNcUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(ncUserId, password);
      navigate('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '로그인 실패');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Nextcloud 문서 AI</h1>
        <p className="eyebrow">로그인</p>
        <form onSubmit={handleSubmit} className="login-form">
          <label>
            Nextcloud 사용자 ID
            <input
              value={ncUserId}
              onChange={(e) => setNcUserId(e.target.value)}
              placeholder="user-a1"
              autoComplete="username"
              required
            />
          </label>
          <label>
            비밀번호
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {error && <p className="error-msg">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  );
}
