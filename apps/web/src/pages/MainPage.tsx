import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminPanel } from '../components/AdminPanel';
import { ChatPanel } from '../components/ChatPanel';
import { FilePanel } from '../components/FilePanel';
import { PdfViewer } from '../components/PdfViewer';
import { type DocumentSource, type FileEntry, type UserUsage, getUsersUsage, logout, parseToken } from '../lib/api';

export function MainPage() {
  const navigate = useNavigate();
  const user = parseToken();

  const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null);
  const [activePage, setActivePage] = useState<number>(1);
  const [selectedSource, setSelectedSource] = useState<DocumentSource | null>(null);
  const [myUsage, setMyUsage] = useState<UserUsage | null>(null);

  useEffect(() => {
    if (!user) return;
    getUsersUsage(user.tenantId)
      .then((res) => {
        const me = res.users.find((u) => u.email === user.email);
        if (me) setMyUsage(me);
      })
      .catch(() => {});
  }, []);

  if (!user) {
    navigate('/login');
    return null;
  }

  function fmtBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  function handleSourceClick(src: DocumentSource) {
    setSelectedSource(src);
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
          {myUsage && (
            <span className="storage-summary" title={`${fmtBytes(myUsage.usedBytes)} / ${fmtBytes(myUsage.quotaBytes)}`}>
              저장공간 {myUsage.usagePercent}%
            </span>
          )}
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
          onSelect={(file) => { setSelectedFile(file); setActivePage(1); setSelectedSource(null); }}
          onDeleted={(fileId) => {
            if (!fileId || selectedFile?.fileId === fileId) {
              setSelectedFile(null);
              setSelectedSource(null);
            }
          }}
        />

        <section className="document-panel" aria-label="PDF 미리보기">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">PDF Viewer</p>
              <h2 title={selectedFile?.fileName}>{selectedFile ? selectedFile.fileName : '파일을 선택하세요'}</h2>
            </div>
            {selectedFile && <span className="page-badge">Page {activePage}</span>}
          </div>

          <div className="pdf-surface">
            {selectedFile?.fileId ? (
              <PdfViewer
                fileId={selectedFile.fileId}
                fileName={selectedFile.fileName}
                pageCount={selectedFile.pageCount}
                activePage={activePage}
                onPageChange={setActivePage}
                highlight={selectedSource?.pageNo === activePage ? selectedSource : null}
              />
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

      {user.role === 'ADMIN' && <AdminPanel currentTenantId={user.tenantId} />}
    </main>
  );
}
