import { useEffect, useRef, useState } from 'react';
import { type FileEntry, deleteFile, deleteFileByPath, listFiles, retryIndexing, uploadFile } from '../lib/api';

interface Props {
  tenantId: string;
  selectedFileId: string | null;
  onSelect: (file: FileEntry) => void;
  onDeleted?: (fileId: string | null) => void;
}

export function FilePanel({ tenantId, selectedFileId, onSelect, onDeleted }: Props) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [retryingFileId, setRetryingFileId] = useState<string | null>(null);
  const [deletingNcPath, setDeletingNcPath] = useState<string | null>(null);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const data = await listFiles(tenantId);
      setFiles(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '파일 목록 로드 실패');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [tenantId]);

  // Poll index status every 5s while any file is PENDING/PROCESSING
  useEffect(() => {
    const hasPending = files.some(
      (f) => f.indexStatus === 'PENDING' || f.indexStatus === 'PROCESSING'
    );
    if (!hasPending) return;
    const id = setInterval(() => void load(), 5000);
    return () => clearInterval(id);
  }, [files]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      await uploadFile(tenantId, file);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '업로드 실패');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleDelete(file: FileEntry) {
    if (!confirm('이 파일을 삭제하시겠습니까?')) return;
    setDeletingNcPath(file.ncPath);
    setError('');
    try {
      if (file.fileId) {
        await deleteFile(file.fileId);
      } else {
        await deleteFileByPath(tenantId, file.ncPath);
      }
      onDeleted?.(file.fileId);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '삭제 실패');
    } finally {
      setDeletingNcPath(null);
    }
  }

  async function handleRetry(fileId: string) {
    setRetryingFileId(fileId);
    setError('');
    try {
      await retryIndexing(fileId);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '재처리 요청 실패');
    } finally {
      setRetryingFileId(null);
    }
  }

  return (
    <aside className="file-panel" aria-label="파일 영역">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Nextcloud</p>
          <h2>문서</h2>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? '업로드 중...' : 'PDF 업로드'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          style={{ display: 'none' }}
          onChange={handleUpload}
        />
      </div>

      {error && <p className="error-msg">{error}</p>}

      <div className="file-list">
        {loading ? (
          <p className="muted">파일 목록 로딩 중...</p>
        ) : files.length === 0 ? (
          <p className="muted">PDF 파일을 업로드해 주세요.</p>
        ) : (
          files.map((file) => {
            const fileId = file.fileId;
            const canSelect = !!fileId;
            const canRetry = !!fileId && file.indexStatus === 'FAILED';
            const isDeleting = deletingNcPath === file.ncPath;
            return (
              <div
                key={file.ncPath}
                className={`file-row${selectedFileId === fileId ? ' file-row--active' : ''}`}
              >
                <button
                  className="file-row-main"
                  type="button"
                  onClick={() => fileId && onSelect(file)}
                  disabled={!canSelect}
                >
                  <span className="file-name">{file.fileName}</span>
                  <span className={`status status--${file.indexStatus.toLowerCase()}`}>
                    {file.indexStatus}
                  </span>
                  {file.pageCount != null && (
                    <span className="muted">{file.pageCount}p</span>
                  )}
                </button>
                {canRetry && (
                  <button
                    className="file-row-retry"
                    type="button"
                    onClick={() => void handleRetry(fileId!)}
                    disabled={retryingFileId === fileId}
                  >
                    {retryingFileId === fileId ? '요청 중' : '재처리'}
                  </button>
                )}
                <button
                  className="file-row-delete"
                  type="button"
                  onClick={() => void handleDelete(file)}
                  disabled={isDeleting}
                  title="삭제"
                >
                  {isDeleting ? '…' : '✕'}
                </button>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
