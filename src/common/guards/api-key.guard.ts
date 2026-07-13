import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/**
 * ApiKeyGuard — protects admin endpoints with a static API key.
 *
 * Expected header: x-api-key
 * Secret value:    ADMIN_API_KEY env variable (required in production)
 *
 * This is intentionally simple for the MVP. If/when real user auth is added,
 * admin endpoints can migrate to a role-based guard without changing the
 * controller decorators.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const providedKey = request.headers['x-api-key'];
    const expectedKey = this.configService.get<string>('ADMIN_API_KEY');

    if (!expectedKey) {
      throw new UnauthorizedException('Admin API key is not configured.');
    }

    if (typeof providedKey !== 'string' || providedKey !== expectedKey) {
      throw new UnauthorizedException('Invalid or missing API key.');
    }

    return true;
  }
}
