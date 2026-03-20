import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/db',
  'packages/core',
  'apps/api',
  'apps/worker',
]);
