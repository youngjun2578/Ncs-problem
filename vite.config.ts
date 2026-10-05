import { createServer, defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

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

/**
 * 개발 서버(npm run dev)와 미리보기(npm run preview)에서 /api/*를 Vercel 함수와 같은 핸들러로 처리한다.
 * 배포 환경에서는 api/*.ts가 Vercel 함수로 따로 동작하고, 이 플러그인은 쓰이지 않는다.
 */
type Handler = (req: Request) => Promise<Response>;
const API_ROUTES: Record<string, keyof typeof import('./server/handlers')> = {
  '/api/session': 'handleSession',
  '/api/report': 'handleReport',
  '/api/account-delete': 'handleAccountDelete',
};

async function toWebRequest(req: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  return new Request(`http://localhost${req.url}`, { method: req.method, headers, body: hasBody ? Buffer.concat(chunks) : undefined });
}

async function sendWebResponse(res: ServerResponse, r: Response) {
  res.statusCode = r.status;
  r.headers.forEach((v, k) => res.setHeader(k, v));
  res.end(Buffer.from(await r.arrayBuffer()));
}

function apiRoutes(): Plugin {
  const attach = (use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void, loader: () => Promise<ViteDevServer>) =>
    use((req, res, next) => {
      const path = (req.url ?? '').split('?')[0];
      if (!path.startsWith('/api/')) return next();
      const name = API_ROUTES[path];
      (async () => {
        if (!name) {
          res.statusCode = 404;
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: 'not_found', message: '없는 API 경로입니다.' }));
          return;
        }
        // 핸들러를 요청마다 불러와서 server/ 코드를 고치면 바로 반영된다
        const mod = await (await loader()).ssrLoadModule('/server/handlers.ts');
        await sendWebResponse(res, await (mod[name] as Handler)(await toWebRequest(req)));
      })().catch((e) => {
        console.error('[api] 개발 서버 처리 오류:', e instanceof Error ? e.message : e);
        if (!res.headersSent) res.statusCode = 500;
        res.end();
      });
    });
  let previewLoader: Promise<ViteDevServer> | null = null;
  return {
    name: 'api-routes',
    configureServer(server) {
      attach((fn) => server.middlewares.use(fn), async () => server);
    },
    configurePreviewServer(server) {
      // 미리보기는 빌드 결과물만 서빙하므로, 핸들러를 불러올 별도 Vite 인스턴스를 만든다
      attach(
        (fn) => server.middlewares.use(fn),
        () =>
          (previewLoader ??= createServer({
            configFile: false,
            root,
            logLevel: 'error',
            appType: 'custom',
            server: { middlewareMode: true, hmr: false, ws: false },
          })),
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, 'VITE_');
  process.env.VITE_LAST_UPDATED = env.VITE_LAST_UPDATED;
  // 로컬 개발용 서버 값(.env.local 등, 커밋하지 않음)을 api 핸들러가 읽을 수 있게 한다.
  // VITE_ 접두어가 없는 값은 브라우저 번들에 들어가지 않는다. 이미 셸에 있는 값이 우선이다.
  const serverEnv = loadEnv(mode, root, ['REPORT_', 'SUPABASE_', 'MONETIZATION_', 'VITE_SUPABASE_URL']);
  for (const k of ['REPORT_TOKEN_SECRET', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL', 'MONETIZATION_ENABLED', 'VITE_SUPABASE_URL'])
    if (!process.env[k] && serverEnv[k]) process.env[k] = serverEnv[k];
  return {
    plugins: [partials(), seoFiles(env.VITE_SITE_URL ?? 'https://example.com'), apiRoutes()],
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
