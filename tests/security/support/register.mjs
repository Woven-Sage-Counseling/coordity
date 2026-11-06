// Test-only module resolution for running Coordity's TypeScript sources under node:test (no new dependencies).
// - Relative imports without an extension ("./env") resolve to the ".ts" file next to them, as Vite/Astro do.
// - "cloudflare:workers" resolves to an inert stub; the tests mock src/lib/env.ts, so no binding is ever read.
import { register } from 'node:module';

register(
  'data:text/javascript,' +
    encodeURIComponent(`
      import { existsSync } from 'node:fs';
      import { fileURLToPath } from 'node:url';
      export async function resolve(specifier, context, next) {
        if (specifier === 'cloudflare:workers') {
          return { url: 'data:text/javascript,export const env = {};', shortCircuit: true };
        }
        if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\\.[cm]?[jt]s$/.test(specifier) && context.parentURL) {
          const candidate = new URL(specifier + '.ts', context.parentURL);
          if (existsSync(fileURLToPath(candidate))) return next(candidate.href, context);
        }
        return next(specifier, context);
      }
    `),
);
