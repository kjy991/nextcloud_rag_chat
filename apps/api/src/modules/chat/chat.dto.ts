import { IsString, MaxLength, MinLength } from 'class-validator';

export class AskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  question: string;
}

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
