import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwind from '@astrojs/tailwind';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  site: 'https://portal.wovensage.com',
  output: 'server',
  adapter: cloudflare({
    imageService: 'passthrough',
  }),
  integrations: [tailwind({ applyBaseStyles: false })],
  security: {
    checkOrigin: true,
  },
  vite: {
    resolve: {
      alias: {
        '@better-auth/utils/password': path.join(root, 'node_modules/@better-auth/utils/dist/password.mjs'),
      },
    },
  },
});
