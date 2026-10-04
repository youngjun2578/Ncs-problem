import { defineConfig, loadEnv, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = __dirname;
const partial = (name: string) => readFileSync(resolve(root, 'src/partials', `${name}.html`), 'utf8');

/** 정적 HTML에 공통 머리말·꼬리말을 끼워 넣는다: <!--#masthead-->, <!--#footer--> */
function partials(): Plugin {
  return {
    name: 'html-partials',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replace('<!--#masthead-->', partial('masthead')).replace('<!--#footer-->', partial('footer')),
    },
  };
}

/** robots.txt, sitemap.xml을 VITE_SITE_URL 기준으로 생성 */
function seoFiles(siteUrl: string): Plugin {
  const base = siteUrl.replace(/\/$/, '');
  return {
    name: 'seo-files',
    apply: 'build',
    generateBundle() {
      const lastmod = process.env.VITE_LAST_UPDATED ?? '';
      const urls = ['/', '/method/'];
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
          .map((u) => `  <url><loc>${base}${u}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`)
          .join('\n')}\n</urlset>\n`,
      });
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *\nAllow: /\nDisallow: /diagnosis/\nSitemap: ${base}/sitemap.xml\n` });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, 'VITE_');
  process.env.VITE_LAST_UPDATED = env.VITE_LAST_UPDATED;
  return {
    plugins: [partials(), seoFiles(env.VITE_SITE_URL ?? 'https://example.com')],
    build: {
      rollupOptions: {
        input: {
          main: resolve(root, 'index.html'),
          diagnosis: resolve(root, 'diagnosis/index.html'),
          method: resolve(root, 'method/index.html'),
        },
      },
    },
  };
});
