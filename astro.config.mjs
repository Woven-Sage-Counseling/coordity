import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwind from '@astrojs/tailwind';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  site: 'https://wovensage.coordity.com',
  output: 'server',
  adapter: cloudflare({
    imageService: 'passthrough',
  }),
  integrations: [tailwind({ applyBaseStyles: false })],
  security: {
    checkOrigin: true,
    // Trust X-Forwarded-Host from the Coordity tenant Worker proxy so CSRF
    // origin checks compare against *.coordity.com instead of pages.dev.
    allowedDomains: [
      { hostname: 'coordity.com', protocol: 'https' },
      { hostname: 'www.coordity.com', protocol: 'https' },
      { hostname: '**.coordity.com', protocol: 'https' },
      { hostname: 'portal.wovensage.com', protocol: 'https' },
      { hostname: 'wovensage-portal-preview.pages.dev', protocol: 'https' },
      { hostname: 'localhost' },
      { hostname: '127.0.0.1' },
    ],
  },
  vite: {
    resolve: {
      alias: {
        '@better-auth/utils/password': path.join(root, 'node_modules/@better-auth/utils/dist/password.mjs'),
      },
    },
  },
});
