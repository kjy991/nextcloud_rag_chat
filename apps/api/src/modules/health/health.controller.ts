import { Controller, Get } from '@nestjs/common';

interface HealthResponse {
  status: 'ok';
  service: string;
  timestamp: string;
}

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return {
      status: 'ok',
      service: 'nextcloud-rag-api',
      timestamp: new Date().toISOString()
    };
  }
}
