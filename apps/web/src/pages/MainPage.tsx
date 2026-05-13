import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminPanel } from '../components/AdminPanel';
import { ChatPanel } from '../components/ChatPanel';
import { FilePanel } from '../components/FilePanel';
import { type DocumentSource, type FileEntry, logout, parseToken } from '../lib/api';

export function MainPage() {
  const navigate = useNavigate();
  const user = parseToken();

  const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null);
  const [activePage, setActivePage] = useState<number>(1);

  if (!user) {
    navigate('/login');
    return null;
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  function handleSourceClick(src: DocumentSource) {
    setActivePage(src.pageNo);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">{user.tenantId}</p>
          <h1>Nextcloud 문서 AI 채팅</h1>
        </div>
        <div className="topbar-right">
          <span className="user-info">{user.email || user.ncUserId}</span>
          <button type="button" onClick={handleLogout} className="btn-logout">
            로그아웃
          </button>
        </div>
      </header>

      <section className="workspace">
        <FilePanel
          tenantId={user.tenantId}
          selectedFileId={selectedFile?.fileId ?? null}
          onSelect={(file) => { setSelectedFile(file); setActivePage(1); }}
        />

        <section className="document-panel" aria-label="PDF 미리보기">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">PDF Viewer</p>
              <h2>{selectedFile ? selectedFile.fileName : '파일을 선택하세요'}</h2>
            </div>
            {selectedFile && activePage > 0 && (
              <span className="page-badge">Page {activePage}</span>
            )}
          </div>

          <div className="pdf-surface">
            {selectedFile ? (
              <div className="pdf-page">
                <p className="muted">
                  {selectedFile.fileName} — {activePage}페이지
                  {selectedFile.pageCount ? ` / ${selectedFile.pageCount}` : ''}
                </p>
                <p className="muted">
                  (PDF Viewer: 근거 카드 클릭 시 해당 페이지로 이동합니다)
                </p>
              </div>
            ) : (
              <div className="pdf-placeholder">
                <p>좌측 파일 목록에서 PDF를 선택하면<br />AI 채팅창이 활성화됩니다.</p>
              </div>
            )}
          </div>
        </section>

        {selectedFile && selectedFile.fileId ? (
          <ChatPanel
            fileId={selectedFile.fileId}
            fileName={selectedFile.fileName}
            onSourceClick={handleSourceClick}
          />
        ) : (
          <aside className="chat-panel chat-panel--empty" aria-label="AI 채팅">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">AI Chat</p>
                <h2>문서 질문</h2>
              </div>
            </div>
            <p className="muted">PDF 파일을 선택하면 채팅이 활성화됩니다.</p>
          </aside>
        )}
      </section>

      <AdminPanel currentTenantId={user.tenantId} />
    </main>
  );
}
