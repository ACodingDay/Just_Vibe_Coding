import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Tests resolve the value import of @deepseek-ai/cordis through the DSH
 * checkout's TypeScript sources (alias → vendor/cordis/src/index.ts);
 * runtime faces are stubbed inside the specs, so no snapshot package is
 * loaded at runtime. React resolves from this repo's own install. The type
 * surface for editor/typecheck lives in tsconfig.json paths (lib/types .d.ts).
 */
const cordisSrc = fileURLToPath(
  new URL('../../deepseek-harness-master/vendor/cordis/src/index.ts', import.meta.url),
)

export default defineConfig({
  resolve: {
    alias: {
      '@deepseek-ai/cordis': cordisSrc,
    },
  },
  test: {
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
    environmentOptions: {
      jsdom: {
        // A real origin is required for window.localStorage to exist.
        url: 'http://localhost:3000/',
        storageQuota: 10000000,
      },
    },
  },
})
