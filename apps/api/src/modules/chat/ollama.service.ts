import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class OllamaService {
  private readonly log = new Logger(OllamaService.name);
  private readonly baseUrl: string;
  private readonly embedModel: string;
  private readonly llmModel: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('OLLAMA_BASE_URL', 'http://localhost:11434');
    this.embedModel = config.get<string>('OLLAMA_EMBED_MODEL', 'nomic-embed-text');
    this.llmModel = config.get<string>('OLLAMA_LLM_MODEL', 'qwen2.5:7b');
  }

  async embed(text: string): Promise<number[]> {
    try {
      const res = await axios.post(
        `${this.baseUrl}/api/embed`,
        { model: this.embedModel, input: [text] },
        { timeout: 30_000 }
      );
      return res.data.embeddings[0] as number[];
    } catch (err) {
      this.log.error('Ollama embed error:', err);
      throw new ServiceUnavailableException('Embedding service unavailable');
    }
  }

  async chat(systemPrompt: string, userMessage: string): Promise<string> {
    try {
      const res = await axios.post(
        `${this.baseUrl}/api/chat`,
        {
          model: this.llmModel,
          stream: false,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ]
        },
        { timeout: 60_000 }
      );
      return (res.data.message?.content ?? '') as string;
    } catch (err) {
      this.log.error('Ollama chat error:', err);
      throw new ServiceUnavailableException('LLM service unavailable');
    }
  }
}
