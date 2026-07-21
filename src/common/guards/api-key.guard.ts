import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

/**
 * ApiKeyGuard — protects API endpoints with a static API key.
 *
 * Expected header: x-api-key
 * Secret value:    ADMIN_API_KEY env variable (required in production)
 *
 * Routes are protected by default. Only handlers or controllers explicitly
 * decorated with @Public() bypass API-key authentication.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const providedKey = request.headers['x-api-key'];
    const expectedKey = this.configService.get<string>('ADMIN_API_KEY');

    if (!expectedKey || expectedKey.trim().length === 0) {
      throw new UnauthorizedException('Admin API key is not configured.');
    }

    if (typeof providedKey !== 'string' || !this.keysMatch(providedKey, expectedKey)) {
      throw new UnauthorizedException('Invalid or missing API key.');
    }

    return true;
  }

  private keysMatch(providedKey: string, expectedKey: string): boolean {
    const providedDigest = createHash('sha256').update(providedKey).digest();
    const expectedDigest = createHash('sha256').update(expectedKey).digest();

    return timingSafeEqual(providedDigest, expectedDigest);
  }
}
