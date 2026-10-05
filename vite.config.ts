import { createServer, defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { writeGuides, CONTENT_DIR, type GuideBuild } from './scripts/guides/build';

const root = __dirname;
const partial = (name: string) => readFileSync(resolve(root, 'src/partials', `${name}.html`), 'utf8');

/** 가이드 링크 자리: 보이는 가이드 글이 있을 때만 링크로 바꾸고, 없으면 그 줄을 통째로 지운다 */
const GUIDE_LINKS: Record<string, string> = {
  footer: '<a href="/guide/">유형별 풀이 가이드</a>',
  main: '<p class="guide-more"><a href="/guide/">유형별 풀이 가이드</a> · 유형마다 풀이 순서와 예제, 자주 하는 실수를 정리했습니다.</p>',
};
const guideLinks = (html: string, show: boolean) =>
  html.replace(/([ \t]*)<!--#guide-link:(\w+)-->\n?/g, (_, indent: string, k: string) => (show ? `${indent}${GUIDE_LINKS[k]}\n` : ''));

/** 정적 HTML에 공통 머리말·꼬리말을 끼워 넣는다: <!--#masthead-->, <!--#footer--> */
function partials(guides: () => GuideBuild): Plugin {
  return {
    name: 'html-partials',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) =>
        guideLinks(html.replace('<!--#masthead-->', partial('masthead')).replace('<!--#footer-->', partial('footer')), guides().visible.length > 0),
    },
  };
}

/** 개발 서버: 가이드 원고가 바뀌면 다시 만들고 새로 고친다 */
function guidesDev(rebuild: () => void): Plugin {
  return {
    name: 'guides-dev',
    apply: 'serve',
    configureServer(server) {
      server.watcher.add(resolve(root, CONTENT_DIR));
      server.watcher.on('all', (_e, file) => {
        if (!file.startsWith(resolve(root, CONTENT_DIR))) return;
        try {
          rebuild();
          server.ws.send({ type: 'full-reload' });
        } catch (e) {
          console.error('[guides]', e instanceof Error ? e.message : e);
        }
      });
    },
  };
}

/** robots.txt, sitemap.xml을 VITE_SITE_URL 기준으로 생성 */
function seoFiles(siteUrl: string, guides: () => GuideBuild): Plugin {
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
          .concat(guideUrls(base, guides()))
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

/** 발행된 가이드만 sitemap에 (운영 빌드에서는 초안이 visible에 없다) */
function guideUrls(base: string, g: GuideBuild): string[] {
  const pub = g.visible.filter((v) => !v.draft);
  if (!pub.length) return [];
  const latest = pub.map((v) => v.updated).sort().at(-1);
  return [`  <url><loc>${base}/guide/</loc><lastmod>${latest}</lastmod></url>`, ...pub.map((v) => `  <url><loc>${base}/guide/${v.slug}/</loc><lastmod>${v.updated}</lastmod></url>`)];
}

export default defineConfig(({ mode, command, isPreview }) => {
  // 가이드 HTML 생성: 개발 서버는 초안 포함, 운영 빌드는 발행 글만. 미리보기는 이미 만든 dist를 쓰므로 만들지 않는다.
  const includeDrafts = command === 'serve';
  let guides: GuideBuild = isPreview ? { pages: {}, visible: [], stats: [] } : writeGuides({ root, includeDrafts });
  const currentGuides = () => guides;
  const env = loadEnv(mode, root, 'VITE_');
  process.env.VITE_LAST_UPDATED = env.VITE_LAST_UPDATED;
  // 로컬 개발용 서버 비밀 값(.env.local 등, 커밋하지 않음)을 api 핸들러가 읽을 수 있게 한다.
  // VITE_ 접두어가 없으므로 브라우저 번들에는 들어가지 않는다.
  const serverEnv = loadEnv(mode, root, 'REPORT_');
  if (!process.env.REPORT_TOKEN_SECRET && serverEnv.REPORT_TOKEN_SECRET) process.env.REPORT_TOKEN_SECRET = serverEnv.REPORT_TOKEN_SECRET;
  return {
    plugins: [
      partials(currentGuides),
      seoFiles(env.VITE_SITE_URL ?? 'https://example.com', currentGuides),
      apiRoutes(),
      guidesDev(() => (guides = writeGuides({ root, includeDrafts }))),
    ],
    build: {
      rollupOptions: {
        input: {
          main: resolve(root, 'index.html'),
          diagnosis: resolve(root, 'diagnosis/index.html'),
          method: resolve(root, 'method/index.html'),
          ...guides.pages,
        },
      },
    },
  };
});
