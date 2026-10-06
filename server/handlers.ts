/**
 * HTTP 핸들러 (Web 표준 Request → Response).
 * Vercel 함수(api/*.ts)와 개발 서버(vite.config.ts)가 같은 함수를 쓴다.
 *
 * 개인정보: 받은 답과 시간은 응답을 만드는 데만 쓰고 저장하지 않는다. 로그에도 남기지 않는다.
 */
import type { ApiError, ApiErrorCode, ReportRequest, ReportResponse, SessionResponse } from '../shared/api.js';
import { ConfigError, generationSeed, issueToken, newPublicSeed, nowSec, readSecret, TOKEN_TTL_SEC, verifyToken } from './token.js';
import { composeReportResponse, generateQuestions, QUESTION_COUNT, score, toPublicQuestion, type ReportScope } from './diagnosis.js';
import { monetizationEnabled } from './config.js';
import { accountService } from './accounts.js';
import { advancedAccess, parseLevel } from './levels.js';

/** 채점 요청 본문 최대 크기 (토큰 + 12문항 답·시간이면 1KB 안팎) */
const MAX_BODY_BYTES = 8 * 1024;
/** 한 세션의 풀이 시간 상한 = 토큰 유효 시간 */
const MAX_TOTAL_SEC = TOKEN_TTL_SEC;
/** 브라우저와 서버 시계 차이, 네트워크 지연 허용 */
const ELAPSED_SLACK_SEC = 120;

const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: HEADERS });

const MESSAGES: Record<ApiErrorCode, string> = {
  bad_request: '요청 형식이 올바르지 않습니다.',
  invalid_token: '진단 정보가 올바르지 않습니다. 새 문제로 다시 시작해 주세요.',
  token_expired: '진단 시간이 만료되었습니다(6시간). 새 문제로 다시 시작해 주세요.',
  method_not_allowed: '허용되지 않은 요청 방식입니다.',
  payload_too_large: '요청이 너무 큽니다.',
  server_misconfigured: '서버 설정 오류로 진단을 시작할 수 없습니다.',
  not_found: '없는 API 경로입니다.',
  level_unavailable: '심화 진단은 지금 이용할 수 없습니다.',
  auth_invalid: '로그인이 만료되었거나 올바르지 않습니다. 다시 로그인해 주세요.',
  service_unavailable: '로그인·이용권 확인 서비스에 잠시 연결할 수 없습니다. 잠시 뒤 다시 시도해 주세요.',
  internal: '서버에서 오류가 났습니다. 잠시 뒤 다시 시도해 주세요.',
};

const STATUS: Record<ApiErrorCode, number> = {
  bad_request: 400,
  invalid_token: 401,
  token_expired: 401,
  method_not_allowed: 405,
  payload_too_large: 413,
  server_misconfigured: 500,
  not_found: 404,
  level_unavailable: 403,
  auth_invalid: 401,
  service_unavailable: 503,
  internal: 500,
};

export function apiError(code: ApiErrorCode, message = MESSAGES[code]): Response {
  const res = json(STATUS[code], { error: code, message } satisfies ApiError);
  if (code === 'method_not_allowed') res.headers.set('allow', 'POST');
  return res;
}

/** 예외를 응답으로 바꾼다. 로그에는 오류 종류만 남기고 요청 내용은 남기지 않는다. */
function fail(where: string, e: unknown): Response {
  if (e instanceof ConfigError) {
    console.error(`[${where}] 설정 오류: ${e.message}`);
    return apiError('server_misconfigured', `${MESSAGES.server_misconfigured} (${e.message})`);
  }
  console.error(`[${where}] 처리 중 오류: ${e instanceof Error ? e.name : typeof e}`);
  return apiError('internal');
}

/**
 * 세션 요청 본문의 level만 읽는다. 이전에는 본문을 읽지 않았으므로,
 * 본문이 없거나 JSON이 아니거나 너무 크면 level이 없는 것으로 본다(기본, 이전과 같은 동작).
 */
async function sessionLevelBody(req: Request): Promise<unknown> {
  try {
    const text = await req.text();
    if (!text || Buffer.byteLength(text) > MAX_BODY_BYTES) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** POST /api/session: 새 시드로 12문항을 만들어 문제만 내려 준다. 본문 { level: "advanced" }면 심화(서버 스위치가 켜졌을 때만). */
export async function handleSession(req: Request): Promise<Response> {
  if (req.method !== 'POST') return apiError('method_not_allowed');
  try {
    const secret = readSecret();
    const parsed = parseLevel(await sessionLevelBody(req));
    if (!parsed.ok) return apiError('bad_request', 'level 값이 올바르지 않습니다. "basic" 또는 "advanced"만 쓸 수 있습니다.');
    const level = parsed.level;
    // 심화를 쓸 수 있는지는 정책 함수 한 곳에서만 판단한다. 꺼져 있으면 조용히 기본으로 바꾸지 않고 오류로 알린다.
    if (level === 'advanced' && (await advancedAccess(req)) !== 'ok') return apiError('level_unavailable');
    const seed = newPublicSeed();
    const iat = nowSec();
    const qs = generateQuestions(generationSeed(secret, seed, level), level);
    const body: SessionResponse = {
      token: issueToken(secret, seed, iat, level),
      expiresAt: new Date((iat + TOKEN_TTL_SEC) * 1000).toISOString(),
      questions: qs.map(toPublicQuestion),
    };
    return json(200, body);
  } catch (e) {
    return fail('session', e);
  }
}

async function readJson(req: Request): Promise<{ ok: true; value: unknown } | { ok: false; res: Response }> {
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) return { ok: false, res: apiError('payload_too_large') };
  const text = await req.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) return { ok: false, res: apiError('payload_too_large') };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, res: apiError('bad_request', '요청 본문이 JSON이 아닙니다.') };
  }
}

/** 입력 모양·범위 검사. 토큰 검증은 따로 한다. */
export function checkReportInput(v: unknown, choiceCounts: number[] | null): string | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return '요청 본문은 객체여야 합니다.';
  const { token, answers, secs } = v as Partial<ReportRequest>;
  if (typeof token !== 'string') return 'token이 없습니다.';
  if (!Array.isArray(answers) || answers.length !== QUESTION_COUNT) return `answers는 ${QUESTION_COUNT}개여야 합니다.`;
  if (!Array.isArray(secs) || secs.length !== QUESTION_COUNT) return `secs는 ${QUESTION_COUNT}개여야 합니다.`;
  for (let i = 0; i < QUESTION_COUNT; i++) {
    const a = answers[i];
    const max = choiceCounts ? choiceCounts[i] : 5;
    if (!Number.isInteger(a) || a < 0 || a >= max) return `${i + 1}번 답이 보기 범위를 벗어났습니다.`;
    const s = secs[i];
    if (typeof s !== 'number' || !Number.isFinite(s) || s < 0 || s > MAX_TOTAL_SEC) return `${i + 1}번 풀이 시간이 범위를 벗어났습니다.`;
  }
  const total = (secs as number[]).reduce((x, y) => x + y, 0);
  if (total > MAX_TOTAL_SEC) return '총 풀이 시간이 범위를 벗어났습니다.';
  return null;
}

/** POST /api/report: 같은 문제를 다시 만들어 채점하고 리포트를 돌려준다 */
export async function handleReport(req: Request): Promise<Response> {
  if (req.method !== 'POST') return apiError('method_not_allowed');
  try {
    const secret = readSecret();
    const body = await readJson(req);
    if (!body.ok) return body.res;
    // 1차: 모양 검사 (문제를 만들기 전에 값싼 검사부터)
    const shapeError = checkReportInput(body.value, null);
    if (shapeError) return apiError('bad_request', shapeError);
    const { token, answers, secs } = body.value as ReportRequest;

    const now = nowSec();
    const t = verifyToken(secret, token, now);
    if (!t.ok) return apiError(t.error);
    // 수준은 서명된 토큰에서만 꺼낸다(요청 본문의 level은 읽지 않는다)
    const level = t.body.l === 'adv' ? 'advanced' : 'basic';
    if (level === 'advanced' && (await advancedAccess(req)) !== 'ok') return apiError('level_unavailable');
    // 풀이 시간 합은 토큰 발급 뒤 흐른 시간을 넘을 수 없다
    const total = secs.reduce((x, y) => x + y, 0);
    if (total > now - t.body.iat + ELAPSED_SLACK_SEC) return apiError('bad_request', '풀이 시간이 진단 시작 이후 흐른 시간보다 깁니다.');

    // 응답 범위: 스위치가 꺼져 있으면 로그인 정보를 보지 않고 전체(이전과 같음)
    const scope = await resolveScope(req);
    if (scope instanceof Response) return scope;

    const qs = generateQuestions(generationSeed(secret, t.body.s, level), level);
    // 2차: 실제 문항의 보기 수로 범위 검사
    const rangeError = checkReportInput(body.value, qs.map((q) => q.choices.length));
    if (rangeError) return apiError('bad_request', rangeError);

    const res: ReportResponse = composeReportResponse(score(qs, answers, secs, level), scope);
    return json(200, res);
  } catch (e) {
    return fail('report', e);
  }
}

/** Authorization: Bearer <토큰> 에서 토큰만 꺼낸다. 헤더가 없으면 null, 모양이 틀리면 false */
function bearer(req: Request): string | null | false {
  const h = req.headers.get('authorization');
  if (h === null || h.trim() === '') return null;
  const m = /^Bearer\s+([A-Za-z0-9._~+/=-]{1,4096})$/.exec(h.trim());
  return m ? m[1] : false;
}

/**
 * 로그인·이용권 상태로 응답 범위를 정한다. 요청 본문의 값은 보지 않는다.
 *  - 스위치 꺼짐 → undefined (전체, 이전과 같음)
 *  - 토큰 없음 → 'free'
 *  - 토큰 검증 실패 → 401, 인증·DB 일시 장애 → 503 (무료/유료로 조용히 처리하지 않음)
 */
async function resolveScope(req: Request): Promise<ReportScope | Response> {
  if (!monetizationEnabled()) return undefined;
  const token = bearer(req);
  if (token === null) return 'free';
  if (token === false) return apiError('auth_invalid');
  const svc = accountService();
  const v = await svc.verify(token);
  if (!v.ok) return apiError(v.reason === 'invalid' ? 'auth_invalid' : 'service_unavailable');
  const e = await svc.entitlement(v.userId);
  if (!e.ok) return apiError('service_unavailable');
  return e.active ? 'full' : 'free';
}

/**
 * POST /api/account-delete: 로그인한 본인의 이용권 행과 계정을 삭제한다.
 * 기능 스위치가 꺼져 있으면 없는 경로처럼 404만 돌려준다(개발 서버의 없는 /api/* 응답과 같은 형식, 설정 값은 보지 않음).
 */
export async function handleAccountDelete(req: Request): Promise<Response> {
  if (!monetizationEnabled()) return apiError('not_found');
  if (req.method !== 'POST') return apiError('method_not_allowed');
  try {
    const token = bearer(req);
    if (!token) return apiError('auth_invalid');
    const svc = accountService();
    const v = await svc.verify(token);
    if (!v.ok) return apiError(v.reason === 'invalid' ? 'auth_invalid' : 'service_unavailable');
    const d = await svc.deleteAccount(v.userId);
    if (!d.ok) return apiError('service_unavailable', '계정을 삭제하지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
    return json(200, { deleted: true });
  } catch (e) {
    return fail('account-delete', e);
  }
}
