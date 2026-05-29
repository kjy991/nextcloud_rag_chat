import { useEffect, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { getFileContent } from '../lib/api';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface Props {
  fileId: string;
  fileName: string;
  pageCount: number | null;
  activePage: number;
  onPageChange: (page: number) => void;
  highlight?: { bbox: number[] | null } | null;
}

export function PdfViewer({ fileId, fileName, pageCount, activePage, onPageChange, highlight }: Props) {
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setPdfData(null);
    setPageSize(null);
    setError('');
    setLoading(true);

    getFileContent(fileId)
      .then((buf) => setPdfData(buf))
      .catch(() => setError('PDF를 불러올 수 없습니다.'))
      .finally(() => setLoading(false));
  }, [fileId]);

  const totalPages = numPages || pageCount || 0;
  const pageWidth = 460;
  const highlightBox = highlight?.bbox && pageSize
    ? {
        left: highlight.bbox[0] * (pageWidth / pageSize.width),
        top: highlight.bbox[1] * (pageWidth / pageSize.width),
        width: (highlight.bbox[2] - highlight.bbox[0]) * (pageWidth / pageSize.width),
        height: (highlight.bbox[3] - highlight.bbox[1]) * (pageWidth / pageSize.width)
      }
    : null;

  return (
    <div className="pdf-viewer">
      <div className="pdf-nav">
        <button
          type="button"
          disabled={activePage <= 1}
          onClick={() => onPageChange(activePage - 1)}
          className="pdf-nav-btn"
        >
          ‹
        </button>
        <span className="pdf-nav-label">
          {activePage} / {totalPages || '?'}
        </span>
        <button
          type="button"
          disabled={activePage >= totalPages}
          onClick={() => onPageChange(activePage + 1)}
          className="pdf-nav-btn"
        >
          ›
        </button>
      </div>

      <div className="pdf-scroll">
        {loading && <p className="muted pdf-status">PDF 로딩 중...</p>}
        {error && <p className="error-msg pdf-status">{error}</p>}
        {pdfData && (
          <Document
            file={pdfData}
            onLoadSuccess={({ numPages: n }) => setNumPages(n)}
            onLoadError={() => setError('PDF 파싱 실패')}
            loading=""
            noData=""
          >
            <div className="pdf-page-frame">
              <Page
                pageNumber={activePage}
                width={pageWidth}
                renderTextLayer={true}
                renderAnnotationLayer={true}
                onLoadSuccess={(page) => {
                  const viewport = page.getViewport({ scale: 1 });
                  setPageSize({ width: viewport.width, height: viewport.height });
                }}
              />
              {highlightBox && (
                <span
                  className="pdf-highlight"
                  style={{
                    left: highlightBox.left,
                    top: highlightBox.top,
                    width: highlightBox.width,
                    height: highlightBox.height
                  }}
                  aria-hidden="true"
                />
              )}
            </div>
          </Document>
        )}
      </div>
    </div>
  );
}
