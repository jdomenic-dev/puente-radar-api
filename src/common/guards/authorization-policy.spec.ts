import 'reflect-metadata';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { HealthController } from '../../modules/health/health.controller.js';
import { ReportsController } from '../../modules/reports/reports.controller.js';

function getReportHandler(handlerName: keyof ReportsController): object {
  return Object.getOwnPropertyDescriptor(ReportsController.prototype, handlerName)?.value as object;
}

describe('authorization policy metadata', () => {
  it('marks every health endpoint public at the controller level', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, HealthController)).toBe(true);
  });

  it('marks only POST /reports public', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, getReportHandler('create'))).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, ReportsController)).toBeUndefined();
  });

  it.each(['findAll', 'getHomeSummary', 'findRecentByBridge'] as const)(
    'keeps ReportsController.%s protected',
    (handlerName) => {
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, getReportHandler(handlerName))).toBeUndefined();
    },
  );
});
