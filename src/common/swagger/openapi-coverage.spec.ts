/**
 * Builds the real OpenAPI document offline (no database) and checks that every endpoint is
 * fully documented. Swagger is only mounted outside production, so this spec is what keeps
 * the document honest for the future develop environment.
 */

import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { BridgesController } from '../../modules/bridges/bridges.controller.js';
import { EstimatesController } from '../../modules/estimates/estimates.controller.js';
import { HealthController } from '../../modules/health/health.controller.js';
import { ReportsController } from '../../modules/reports/reports.controller.js';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

/** Every operation the API exposes. A new endpoint must be added here, documented, and tested. */
const EXPECTED_OPERATIONS = [
  'GET /bridges',
  'GET /bridges/summary',
  'GET /bridges/slug/{slug}',
  'GET /bridges/{id}',
  'PATCH /bridges/{id}/status',
  'POST /reports',
  'GET /reports',
  'GET /reports/summary/home',
  'GET /reports/bridge/{bridgeId}/recent',
  'GET /estimates',
  'GET /estimates/overview',
  'GET /health',
].sort();

/** Routes that need no API key (marked @Public in code). */
const PUBLIC_OPERATIONS = ['GET /health', 'POST /reports', 'GET /estimates/overview'];

const EXPECTED_QUERY_PARAMS: Record<string, string[]> = {
  'GET /estimates': ['laneType'],
  'GET /reports': ['bridgeId', 'limit'],
  'GET /reports/bridge/{bridgeId}/recent': ['limit'],
};

interface Operation {
  key: string;
  summary?: string;
  parameters?: Array<{ name: string; in: string; description?: string; schema?: Record<string, unknown> }>;
  requestBody?: unknown;
  responses?: Record<string, { description?: string; content?: Record<string, { schema?: Record<string, unknown> }> }>;
  security?: Array<Record<string, string[]>>;
}

function collectOperations(document: OpenAPIObject): Operation[] {
  const operations: Operation[] = [];
  for (const [path, item] of Object.entries(document.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = (item as Record<string, unknown>)[method];
      if (operation) {
        operations.push({ ...(operation as object), key: `${method.toUpperCase()} ${path}` } as Operation);
      }
    }
  }
  return operations;
}

describe('OpenAPI document coverage', () => {
  let app: INestApplication;
  let operations: Operation[];
  let document: OpenAPIObject;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BridgesController, ReportsController, EstimatesController, HealthController],
    })
      .useMocker(() => ({}))
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();

    document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'api-key').build(),
    );
    operations = collectOperations(document);
  });

  afterAll(async () => {
    await app.close();
  });

  it('exposes exactly the expected operations', () => {
    expect(operations.map((o) => o.key).sort()).toEqual(EXPECTED_OPERATIONS);
  });

  it('gives every operation a summary and a successful response', () => {
    const problems = operations.flatMap((op) => {
      const found: string[] = [];
      if (!op.summary?.trim()) found.push(`${op.key}: missing summary`);
      if (!Object.keys(op.responses ?? {}).some((status) => status.startsWith('2'))) {
        found.push(`${op.key}: no 2xx response`);
      }
      return found;
    });
    expect(problems).toEqual([]);
  });

  it('describes every path parameter with a description and a type', () => {
    const problems = operations.flatMap((op) =>
      (op.parameters ?? [])
        .filter((p) => p.in === 'path')
        .filter((p) => !p.description?.trim() || !p.schema?.type)
        .map((p) => `${op.key}: path param "${p.name}" lacks description or type`),
    );
    expect(problems).toEqual([]);
  });

  it('declares the query parameters each endpoint accepts, with descriptions', () => {
    const problems = operations.flatMap((op) => {
      const query = (op.parameters ?? []).filter((p) => p.in === 'query');
      const expected = EXPECTED_QUERY_PARAMS[op.key] ?? [];
      const found: string[] = [];
      for (const name of expected) {
        const param = query.find((p) => p.name === name);
        if (!param) found.push(`${op.key}: query "${name}" not documented`);
        else if (!param.description?.trim()) found.push(`${op.key}: query "${name}" has no description`);
      }
      for (const param of query) {
        if (!expected.includes(param.name)) found.push(`${op.key}: unexpected query "${param.name}"`);
      }
      return found;
    });
    expect(problems).toEqual([]);
  });

  it('marks API-key routes with the security scheme and a 401, and public routes with neither', () => {
    const problems = operations.flatMap((op) => {
      const isPublic = PUBLIC_OPERATIONS.includes(op.key);
      const hasSecurity = (op.security ?? []).some((s) => 'api-key' in s);
      const has401 = '401' in (op.responses ?? {});
      if (isPublic) {
        return [
          ...(hasSecurity ? [`${op.key}: public route claims api-key security`] : []),
          ...(has401 ? [`${op.key}: public route documents 401`] : []),
        ];
      }
      return [
        ...(hasSecurity ? [] : [`${op.key}: missing api-key security`]),
        ...(has401 ? [] : [`${op.key}: missing 401`]),
      ];
    });
    expect(problems).toEqual([]);
  });

  it('documents 400 wherever input is validated (body, query or uuid path params)', () => {
    const problems = operations
      .filter(
        (op) =>
          op.requestBody ||
          (op.parameters ?? []).some(
            (p) =>
              p.in === 'query' ||
              (p.in === 'path' && /(^|\/)\{(id|bridgeId)\}/.test(op.key) && ['id', 'bridgeId'].includes(p.name)),
          ),
      )
      .filter((op) => !('400' in (op.responses ?? {})))
      .map((op) => `${op.key}: missing 400`);
    expect(problems).toEqual([]);
  });

  it('documents 429 on every operation, because a global rate limit applies', () => {
    const problems = operations.filter((op) => !('429' in (op.responses ?? {}))).map((op) => `${op.key}: missing 429`);
    expect(problems).toEqual([]);
  });

  it('gives every 2xx response with a body a real schema, not only a description', () => {
    const problems = operations.flatMap((op) =>
      Object.entries(op.responses ?? {})
        .filter(([status]) => status.startsWith('2'))
        .filter(([, response]) => {
          const schema = response.content?.['application/json']?.schema;
          return !schema || Object.keys(schema).length === 0;
        })
        .map(([status]) => `${op.key}: ${status} has no response schema`),
    );
    expect(problems).toEqual([]);
  });

  it('describes the properties of every schema the document references', () => {
    const schemas = document.components?.schemas ?? {};
    const problems = Object.entries(schemas)
      .filter(
        ([, schema]) =>
          !('properties' in schema) || Object.keys((schema as { properties: object }).properties).length === 0,
      )
      .map(([name]) => `schema "${name}" has no properties`);
    expect(problems).toEqual([]);
  });

  it('documents every column of Bridge and Report, including the catalog fields', () => {
    const properties = (name: string): string[] =>
      Object.keys(((document.components?.schemas ?? {})[name] as { properties?: object })?.properties ?? {});

    expect(properties('Bridge')).toEqual(
      expect.arrayContaining([
        'id',
        'slug',
        'name',
        'shortName',
        'latitude',
        'longitude',
        'opensAt',
        'closesAt',
        'status',
      ]),
    );
    expect(properties('Report')).toEqual(
      expect.arrayContaining(['id', 'bridgeId', 'laneType', 'lineStatus', 'reportedWaitMinutes', 'createdAt']),
    );
  });
});
