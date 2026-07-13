import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApiKeyGuard } from '../../common/guards/api-key.guard.js';

/**
 * AuthModule — minimal auth seam for the MVP.
 *
 * Currently provides:
 *   - ApiKeyGuard: static key guard for admin endpoints.
 *
 * Real JWT/session authentication can be added later without changing
 * the controllers that already rely on ApiKeyGuard.
 */
@Module({
  imports: [ConfigModule],
  providers: [ApiKeyGuard],
  exports: [ApiKeyGuard],
})
export class AuthModule {}
