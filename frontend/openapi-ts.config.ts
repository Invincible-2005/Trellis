// Generates lib/api/schemas/zod.gen.ts (zod schemas) from the backend's openapi.json (trellis/12 D49).
// Run with `pnpm api:generate`, together with the TypeScript types in v1.d.ts.
import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: '../backend/openapi.json',
  output: {
    path: 'lib/api/schemas',
    clean: false, // the folder also holds our per-area files; only zod.gen.ts is written
    entryFile: false,
  },
  plugins: [
    {
      name: 'zod',
      // One schema per backend model, e.g. zCreateRoleRequest. Per-endpoint copies aren't needed.
      requests: false,
      responses: false,
      // Pydantic accepts dates with an offset (+05:30) or none, not only "Z".
      dates: { offset: true, local: true },
    },
  ],
});
