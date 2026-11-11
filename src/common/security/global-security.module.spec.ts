import type { Server } from 'node:http';
import { Controller, Get, INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { Public } from '../decorators/public.decorator.js';
import { GlobalSecurityModule } from './global-security.module.js';

@Controller('probe')
class ProbeController {
  @Get('private')
  private_(): { ok: true } {
    return { ok: true };
  }

  @Public()
  @Get('open')
  open(): { ok: true } {
    return { ok: true };
  }
}

const KEY = 'test-admin-key-0123456789';

async function createApp(limit: number): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ ADMIN_API_KEY: KEY })] }),
      ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60_000, limit }] }),
      GlobalSecurityModule,
    ],
    controllers: [ProbeController],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe('GlobalSecurityModule', () => {
  it('rate-limits requests that fail authentication, so the API key cannot be guessed freely', async () => {
    const app = await createApp(3);
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await request(app.getHttpServer() as Server)
        .get('/probe/private')
        .set('x-api-key', 'wrong');
      statuses.push(res.status);
    }
    await app.close();

    // The limiter runs before the API-key guard: after 3 hits, 401 turns into 429.
    expect(statuses).toEqual([401, 401, 401, 429, 429]);
  });

  it('serves protected routes with the right key and public routes without one', async () => {
    const app = await createApp(100);
    const server = app.getHttpServer() as Server;

    const withKey = await request(server).get('/probe/private').set('x-api-key', KEY);
    const withoutKey = await request(server).get('/probe/private');
    const open = await request(server).get('/probe/open');
    await app.close();

    expect([withKey.status, withoutKey.status, open.status]).toEqual([200, 401, 200]);
  });
});
