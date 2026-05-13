import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QdrantClient } from '@qdrant/js-client-rest';

export interface SearchResult {
  chunkId: string;
  documentId: string;
  fileName: string;
  pageNo: number;
  paragraphNo: number;
  text: string;
  bbox: number[] | null;
  score: number;
}

@Injectable()
export class QdrantService {
  private readonly log = new Logger(QdrantService.name);
  private readonly client: QdrantClient;
  private readonly collection: string;

  constructor(config: ConfigService) {
    this.client = new QdrantClient({
      url: config.get<string>('QDRANT_URL', 'http://localhost:6333'),
      checkCompatibility: false
    });
    this.collection = config.get<string>('QDRANT_COLLECTION', 'documents');
  }

  async search(
    vector: number[],
    tenantId: string,
    documentId: string,
    limit = 5
  ): Promise<SearchResult[]> {
    try {
      const res = await this.client.search(this.collection, {
        vector,
        limit,
        filter: {
          must: [
            { key: 'tenantId', match: { value: tenantId } },
            { key: 'documentId', match: { value: documentId } }
          ]
        },
        with_payload: true
      });

      return res.map((hit) => {
        const p = hit.payload as Record<string, unknown>;
        return {
          chunkId: String(p['chunkId'] ?? ''),
          documentId: String(p['documentId'] ?? ''),
          fileName: String(p['fileName'] ?? ''),
          pageNo: Number(p['pageNo'] ?? 0),
          paragraphNo: Number(p['paragraphNo'] ?? 0),
          text: String(p['text'] ?? ''),
          bbox: Array.isArray(p['bbox']) ? (p['bbox'] as number[]) : null,
          score: hit.score
        };
      });
    } catch (err) {
      this.log.error('Qdrant search error:', err);
      throw new ServiceUnavailableException('Vector search service unavailable');
    }
  }
}
