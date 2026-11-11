/**
 * global-security.module.ts
 *
 * Registers the global guards in an explicit order. Nest runs APP_GUARD providers in
 * declaration order, so the rate limiter must come first: otherwise requests with a wrong or
 * missing API key are rejected before they are counted, and the key could be guessed freely.
 *
 * Requires ThrottlerModule to be registered by the importing module.
 */

import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ApiKeyGuard } from '../guards/api-key.guard.js';

@Module({
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: ApiKeyGuard },
  ],
})
export class GlobalSecurityModule {}
