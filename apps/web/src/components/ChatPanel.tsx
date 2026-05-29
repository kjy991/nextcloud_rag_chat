import { useEffect, useRef, useState } from 'react';
import { type ChatResponse, type DocumentSource, askFile } from '../lib/api';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  sources?: DocumentSource[];
}

interface Props {
  fileId: string;
  fileName: string;
  onSourceClick: (source: DocumentSource) => void;
}

export function ChatPanel({ fileId, fileName, onSourceClick }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages([]);
    setError('');
  }, [fileId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || loading) return;

    setMessages((prev) => [...prev, { role: 'user', text: q }]);
    setQuestion('');
    setLoading(true);
    setError('');

    try {
      const res: ChatResponse = await askFile(fileId, q);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: res.answer, sources: res.sources }
      ]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '응답 실패');
    } finally {
      setLoading(false);
    }
  }

  return (
    <aside className="chat-panel" aria-label="AI 채팅">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">AI Chat</p>
          <h2 title={fileName}>{fileName}</h2>
        </div>
      </div>

      <div className="chat-stream">
        {messages.length === 0 && (
          <p className="muted">문서에 대해 질문해 보세요.</p>
        )}

        {messages.map((msg, i) => (
          <div key={i}>
            <div className={`message message--${msg.role}`}>{msg.text}</div>
            {msg.sources && msg.sources.length > 0 && (
              <div className="source-list">
                {msg.sources.map((src, j) => (
                  <button
                    key={j}
                    className="source-card"
                    type="button"
                    onClick={() => onSourceClick(src)}
                  >
                    <strong>{src.fileName}</strong>
                    <span>{src.pageNo}p · §{src.paragraphNo}</span>
                    <small>{src.text.slice(0, 60)}…</small>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="message message--assistant muted">답변 생성 중...</div>
        )}
        {error && <p className="error-msg">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <form className="chat-form" onSubmit={handleSubmit}>
        <input
          aria-label="질문 입력"
          placeholder="문서에 대해 질문하세요"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={loading}
        />
        <button type="submit" disabled={loading || !question.trim()}>
          전송
        </button>
      </form>
    </aside>
  );
}
