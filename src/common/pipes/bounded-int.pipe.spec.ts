import { BadRequestException } from '@nestjs/common';
import { BoundedIntPipe } from './bounded-int.pipe.js';

describe('BoundedIntPipe', () => {
  const pipe = new BoundedIntPipe({ min: 1, max: 100, fallback: 10 });

  it('uses the fallback when the value is missing or empty', () => {
    expect(pipe.transform(undefined)).toBe(10);
    expect(pipe.transform('')).toBe(10);
  });

  it('parses integers inside the range, including both bounds', () => {
    expect(pipe.transform('1')).toBe(1);
    expect(pipe.transform('37')).toBe(37);
    expect(pipe.transform('100')).toBe(100);
  });

  it.each(['0', '-5', '101', '1000000'])('rejects %s as out of range', (value) => {
    expect(() => pipe.transform(value)).toThrow(BadRequestException);
  });

  it.each(['abc', '1.5', '10abc', ' 7', '1e3'])('rejects %s as not an integer', (value) => {
    expect(() => pipe.transform(value)).toThrow(BadRequestException);
  });

  it('explains the allowed range in the error', () => {
    expect(() => pipe.transform('500')).toThrow(/between 1 and 100/);
  });
});
