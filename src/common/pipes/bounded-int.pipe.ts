/**
 * bounded-int.pipe.ts
 *
 * Parses an integer query parameter and rejects values outside [min, max] with a 400, so a
 * caller cannot ask for an unbounded number of rows.
 */

import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

export interface BoundedIntOptions {
  min: number;
  max: number;
  /** Used when the parameter is absent or empty. */
  fallback: number;
}

@Injectable()
export class BoundedIntPipe implements PipeTransform<string | undefined, number> {
  constructor(private readonly options: BoundedIntOptions) {}

  transform(value: string | undefined): number {
    const { min, max, fallback } = this.options;
    if (value === undefined || value === '') return fallback;
    if (!/^-?\d+$/.test(value)) {
      throw new BadRequestException('Validation failed (an integer is expected)');
    }
    const parsed = Number(value);
    if (parsed < min || parsed > max) {
      throw new BadRequestException(`Validation failed (value must be between ${min} and ${max})`);
    }
    return parsed;
  }
}
