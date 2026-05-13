import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = config.get<number>('API_PORT', 4000);
  const host = config.get<string>('API_HOST', '127.0.0.1');
  const webOrigin = config.get<string>('WEB_ORIGIN', 'http://localhost:5173');

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: webOrigin,
    credentials: true
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );

  await app.listen(port, host);
}

void bootstrap();
