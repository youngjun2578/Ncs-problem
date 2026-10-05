/**
 * HTTP 핸들러 (Web 표준 Request → Response).
 * Vercel 함수(api/*.ts)와 개발 서버(vite.config.ts)가 같은 함수를 쓴다.
 *
 * 개인정보: 받은 답과 시간은 응답을 만드는 데만 쓰고 저장하지 않는다. 로그에도 남기지 않는다.
 */
import type { ApiError, ApiErrorCode, ReportRequest, ReportResponse, SessionResponse } from '../shared/api.js';
import { ConfigError, generationSeed, issueToken, newPublicSeed, nowSec, readSecret, TOKEN_TTL_SEC, verifyToken } from './token.js';
import { composeReportResponse, generateQuestions, QUESTION_COUNT, score, toPublicQuestion } from './diagnosis.js';

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
  internal: '서버에서 오류가 났습니다. 잠시 뒤 다시 시도해 주세요.',
};

const STATUS: Record<ApiErrorCode, number> = {
  bad_request: 400,
  invalid_token: 401,
  token_expired: 401,
  method_not_allowed: 405,
  payload_too_large: 413,
  server_misconfigured: 500,
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

/** POST /api/session: 새 시드로 12문항을 만들어 문제만 내려 준다 */
export async function handleSession(req: Request): Promise<Response> {
  if (req.method !== 'POST') return apiError('method_not_allowed');
  try {
    const secret = readSecret();
    const seed = newPublicSeed();
    const iat = nowSec();
    const qs = generateQuestions(generationSeed(secret, seed));
    const body: SessionResponse = {
      token: issueToken(secret, seed, iat),
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
    // 풀이 시간 합은 토큰 발급 뒤 흐른 시간을 넘을 수 없다
    const total = secs.reduce((x, y) => x + y, 0);
    if (total > now - t.body.iat + ELAPSED_SLACK_SEC) return apiError('bad_request', '풀이 시간이 진단 시작 이후 흐른 시간보다 깁니다.');

    const qs = generateQuestions(generationSeed(secret, t.body.s));
    // 2차: 실제 문항의 보기 수로 범위 검사
    const rangeError = checkReportInput(body.value, qs.map((q) => q.choices.length));
    if (rangeError) return apiError('bad_request', rangeError);

    const res: ReportResponse = composeReportResponse(score(qs, answers, secs));
    return json(200, res);
  } catch (e) {
    return fail('report', e);
  }
}
