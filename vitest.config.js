import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';
import { pbkdf2Sync } from 'node:crypto';

const salt = '00112233445566778899aabbccddeeff';
const hash = pbkdf2Sync('test-only-password', salt, 100000, 32, 'sha256').toString('hex');
export default defineConfig({
  plugins: [cloudflareTest({
    wrangler: { configPath: './wrangler.jsonc' },
    miniflare: { bindings: { GROW_PASSWORD_HASH: salt + '$' + hash } },
  })],
  test: { include: ['tests/cloud.test.js'], testTimeout: 20000 },
});
