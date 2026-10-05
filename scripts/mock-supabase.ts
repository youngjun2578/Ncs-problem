/**
 * 시험용 모의 Supabase (인증 + 이용권 테이블). 실제 Supabase에 접근할 수 없는 환경에서
 * 서버 테스트(scripts/gating-test.ts)와 브라우저 테스트가 실제 supabase-js 코드 경로를 그대로 타게 한다.
 *
 *   npx tsx scripts/mock-supabase.ts [포트]     (기본 54329, 단독 실행)
 *
 * 흉내 내는 것
 *  - GET  /auth/v1/authorize        OAuth 시작 → 곧바로 redirect_to?code=… 로 되돌려 보냄(구글·카카오 화면 생략)
 *  - POST /auth/v1/token            PKCE 코드 교환(code_verifier 검사), 토큰 갱신
 *  - GET  /auth/v1/user             액세스 토큰(HS256) 검증. 틀리거나 만료면 403
 *  - POST /auth/v1/logout
 *  - DELETE /auth/v1/admin/users/:id  (서비스 키 필요)
 *  - GET/DELETE /rest/v1/entitlements  (서비스 키면 전체, 사용자 토큰이면 본인 행만 = RLS 흉내)
 *  - POST /__mock/state             시험 상태 바꾸기: { entitled: {userId: bool}, auth: 'ok'|'500', db: 'ok'|'500', reset }
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, createHmac, randomBytes } from 'node:crypto';

export const MOCK_JWT_SECRET = 'mock-jwt-secret-for-tests-only-0123456789';
export const MOCK_SERVICE_KEY = 'mock-service-role-key-DO-NOT-SHIP-7f3a9c';
export const MOCK_ANON_KEY = 'mock-anon-key-public';
export const MOCK_USERS = {
  google: { id: '11111111-1111-4111-8111-111111111111', email: 'tester@example.com' },
  kakao: { id: '22222222-2222-4222-8222-222222222222', email: undefined },
} as const;

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export function signJwt(payload: Record<string, unknown>, secret = MOCK_JWT_SECRET): string {
  const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify(payload));
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

export function userToken(provider: 'google' | 'kakao', opts: { expIn?: number; secret?: string } = {}): string {
  const now = Math.floor(Date.now() / 1000);
  return signJwt(
    { sub: MOCK_USERS[provider].id, aud: 'authenticated', role: 'authenticated', iat: now, exp: now + (opts.expIn ?? 3600), app_metadata: { provider } },
    opts.secret,
  );
}

function verifyJwt(token: string): Record<string, any> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const sig = createHmac('sha256', MOCK_JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest('base64url');
  if (sig !== parts[2]) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (typeof p.exp !== 'number' || p.exp < Date.now() / 1000) return null;
    return p;
  } catch {
    return null;
  }
}

interface State {
  entitled: Record<string, boolean>;
  deleted: Set<string>;
  auth: 'ok' | '500';
  db: 'ok' | '500';
  codes: Map<string, { provider: 'google' | 'kakao'; challenge: string }>;
  calls: string[];
}

function userObject(provider: 'google' | 'kakao') {
  const u = MOCK_USERS[provider];
  return {
    id: u.id,
    aud: 'authenticated',
    role: 'authenticated',
    ...(u.email ? { email: u.email } : {}),
    app_metadata: { provider, providers: [provider] },
    user_metadata: {},
    created_at: '2026-10-05T00:00:00Z',
  };
}

function session(provider: 'google' | 'kakao') {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: userToken(provider),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: `refresh-${provider}-${randomBytes(6).toString('hex')}`,
    user: userObject(provider),
  };
}

export async function startMockSupabase(port = 54329) {
  const state: State = { entitled: {}, deleted: new Set(), auth: 'ok', db: 'ok', codes: new Map(), calls: [] };
  const providerOf = (id: string) => (id === MOCK_USERS.google.id ? 'google' : id === MOCK_USERS.kakao.id ? 'kakao' : null);

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    res.setHeader('access-control-allow-origin', req.headers.origin ?? '*');
    res.setHeader('access-control-allow-headers', 'authorization, apikey, content-type, x-client-info, accept-profile, content-profile, prefer, x-supabase-api-version');
    res.setHeader('access-control-allow-methods', 'GET, POST, DELETE, PATCH, OPTIONS');
    if (req.method === 'OPTIONS') return void res.writeHead(204).end();
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString();
    const body = raw ? (() => { try { return JSON.parse(raw); } catch { return {}; } })() : {};
    const send = (status: number, data?: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(data === undefined ? '' : JSON.stringify(data));
    };
    const bearer = (req.headers.authorization ?? '').replace(/^Bearer\s+/, '');
    const isService = bearer === MOCK_SERVICE_KEY;
    state.calls.push(`${req.method} ${url.pathname}`);

    if (url.pathname === '/__mock/state' && req.method === 'POST') {
      if (body.reset) Object.assign(state, { entitled: {}, deleted: new Set(), auth: 'ok', db: 'ok', calls: [] });
      if (body.entitled) Object.assign(state.entitled, body.entitled);
      if (body.auth) state.auth = body.auth;
      if (body.db) state.db = body.db;
      return send(200, { entitled: state.entitled, auth: state.auth, db: state.db, deleted: [...state.deleted] });
    }
    if (url.pathname === '/auth/v1/authorize') {
      const provider = url.searchParams.get('provider') as 'google' | 'kakao';
      const redirect = url.searchParams.get('redirect_to') ?? '/';
      const code = randomBytes(8).toString('hex');
      state.codes.set(code, { provider, challenge: url.searchParams.get('code_challenge') ?? '' });
      const to = new URL(redirect);
      to.searchParams.set('code', code);
      res.writeHead(302, { location: to.toString() });
      return void res.end();
    }
    if (url.pathname === '/auth/v1/token') {
      if (state.auth === '500') return send(500, { msg: 'mock auth down' });
      const grant = url.searchParams.get('grant_type');
      if (grant === 'pkce') {
        const entry = state.codes.get(body.auth_code);
        const ok = entry && createHash('sha256').update(body.code_verifier ?? '').digest('base64url') === entry.challenge;
        if (!ok || !entry) return send(400, { code: 400, error_code: 'bad_code_verifier', msg: 'invalid code' });
        state.codes.delete(body.auth_code);
        return send(200, session(entry.provider));
      }
      if (grant === 'refresh_token') {
        const m = /^refresh-(google|kakao)-/.exec(body.refresh_token ?? '');
        if (!m) return send(400, { code: 400, error_code: 'refresh_token_not_found', msg: 'invalid refresh' });
        return send(200, session(m[1] as 'google' | 'kakao'));
      }
      return send(400, { msg: 'unsupported grant' });
    }
    if (url.pathname === '/auth/v1/user' && req.method === 'GET') {
      if (state.auth === '500') return send(500, { msg: 'mock auth down' });
      const p = verifyJwt(bearer);
      const provider = p ? providerOf(p.sub) : null;
      if (!p || !provider || state.deleted.has(p.sub)) return send(403, { code: 403, error_code: 'bad_jwt', msg: 'invalid JWT' });
      return send(200, userObject(provider));
    }
    if (url.pathname === '/auth/v1/logout') return void res.writeHead(204).end();
    const adm = /^\/auth\/v1\/admin\/users\/([^/]+)$/.exec(url.pathname);
    if (adm && req.method === 'DELETE') {
      if (!isService) return send(403, { msg: 'service key required' });
      if (state.auth === '500') return send(500, { msg: 'mock auth down' });
      state.deleted.add(adm[1]);
      return send(200, {});
    }
    if (url.pathname === '/rest/v1/entitlements') {
      if (state.db === '500') return send(500, { message: 'mock db down' });
      const uid = (url.searchParams.get('user_id') ?? '').replace(/^eq\./, '');
      // PostgREST처럼: 공개 키·서비스 키가 아닌 토큰이 틀리면 401
      if (!isService && bearer && bearer !== MOCK_ANON_KEY && !verifyJwt(bearer)) return send(401, { code: 'PGRST301', message: 'JWT invalid' });
      // RLS 흉내: 서비스 키가 아니면 토큰 주인의 행만
      const viewer = isService ? null : verifyJwt(bearer)?.sub;
      const visible = isService || viewer === uid;
      if (req.method === 'GET') {
        const rows = visible && state.entitled[uid] !== undefined ? [{ status: state.entitled[uid] ? 'active' : 'revoked', purchased_at: '2026-10-05T00:00:00Z' }] : [];
        return send(200, rows);
      }
      if (req.method === 'DELETE') {
        if (!isService) return send(403, { message: 'permission denied' });
        delete state.entitled[uid];
        return void res.writeHead(204).end();
      }
    }
    send(404, { msg: `mock: ${req.method} ${url.pathname}` });
  });
  await new Promise<void>((r) => server.listen(port, '127.0.0.1', r));
  // port 0이면 빈 포트를 고른다
  const actual = (server.address() as { port: number }).port;
  return {
    url: `http://127.0.0.1:${actual}`,
    state,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

if (process.argv[1]?.endsWith('mock-supabase.ts')) {
  const port = Number(process.argv[2] ?? 54329);
  startMockSupabase(port).then((m) => console.log(`모의 Supabase: ${m.url}`));
}
