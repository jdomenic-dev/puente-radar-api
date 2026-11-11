import 'reflect-metadata';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { HealthController } from '../../modules/health/health.controller.js';
import { ReportsController } from '../../modules/reports/reports.controller.js';
import { EstimatesController } from '../../modules/estimates/estimates.controller.js';

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

  describe('estimates', () => {
    const handler = (name: keyof EstimatesController): object =>
      Object.getOwnPropertyDescriptor(EstimatesController.prototype, name)?.value as object;

    it('makes the Home overview public: it only serves public CBP wait data and must not need the admin key in the app', () => {
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler('getOverview'))).toBe(true);
    });

    it('keeps GET /estimates protected and the controller itself not public', () => {
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler('getEstimates'))).toBeUndefined();
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, EstimatesController)).toBeUndefined();
    });
  });
});
