import { Test } from '@nestjs/testing';
import { HealthController } from '../src/modules/health/health.controller';

describe('HealthController', () => {
  it('returns service health', () => {
    const controller = new HealthController();

    expect(controller.getHealth()).toMatchObject({
      status: 'ok',
      service: 'nextcloud-rag-api'
    });
  });

  it('is available through the testing module', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController]
    }).compile();

    const controller = moduleRef.get(HealthController);
    expect(controller.getHealth().timestamp).toEqual(expect.any(String));
  });
});
