/**
 * audit-script.contract.spec.ts — guards `pnpm run audit:cbp-history` against regressing to the
 * broken `ts-node --esm` source-path invocation. That invocation fails with ERR_MODULE_NOT_FOUND
 * because ts-node's ESM loader does not remap the runner's `.js`-suffixed relative imports (which
 * point at the compiled sibling `.js` files emitted by `tsc`) back onto the `.ts` sources. The
 * production command must run the compiled CommonJS output directly because the image does not
 * contain source files or development dependencies.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('audit:cbp-history package script', () => {
  it('directly executes the compiled runner without build or source-time dependencies', () => {
    const packageJsonPath = resolve(__dirname, '..', '..', '..', 'package.json');
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { scripts: Record<string, string> };
    const script = pkg.scripts['audit:cbp-history'];

    expect(script).toBe('node dist/database/audit/run-cbp-history-audit.js');
  });
});
