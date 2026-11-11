import { createRedisStatusLogger } from './redis-status-logger.js';

describe('createRedisStatusLogger', () => {
  function setup() {
    const logger = { log: jest.fn(), warn: jest.fn() };
    return { logger, status: createRedisStatusLogger(logger) };
  }

  it('reports the first successful connection', () => {
    const { logger, status } = setup();

    status.onReady();

    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('connected'));
  });

  it('warns once per outage, however many errors the client emits while retrying', () => {
    const { logger, status } = setup();

    for (let i = 0; i < 50; i++) status.onError(new Error('ECONNREFUSED'));

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('ECONNREFUSED'));
  });

  it('says why even when the error has no message', () => {
    const { logger, status } = setup();

    status.onError(new Error(''));

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('no message'));
  });

  it('announces recovery and warns again on the next outage', () => {
    const { logger, status } = setup();

    status.onError(new Error('down'));
    status.onReady();
    status.onError(new Error('down again'));

    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('recovered'));
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });
});
