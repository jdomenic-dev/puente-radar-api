import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ApiKeyGuard } from '../../common/guards/api-key.guard.js';

/**
 * AuthModule — minimal auth seam for the MVP.
 *
 * Currently provides:
 *   - ApiKeyGuard: global static-key guard for all non-public endpoints.
 *
 * Real JWT/session authentication can replace this global guard later.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
  ],
})
export class AuthModule {}
