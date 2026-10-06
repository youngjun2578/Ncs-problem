/**
 * 세션 토큰: DB 없이 HMAC-SHA256으로 서명한다.
 *   형식: base64url(JSON 본문) + "." + base64url(서명)
 *   본문: { v: 버전, s: 공개 시드, iat: 발급 시각(초) } — 심화일 때만 l: "adv"가 붙는다(기본 토큰은 이전과 같은 모양)
 *
 * 문제 생성에 쓰는 시드는 공개 시드를 그대로 쓰지 않고 서명 키로 한 번 더 감싼다(generationSeed).
 * 토큰 본문은 누구나 읽을 수 있으므로, 키 없이 시드만으로 정답을 재현하지 못하게 하기 위해서다.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const TOKEN_VERSION = 1;
export const TOKEN_TTL_SEC = 6 * 60 * 60;
/** 서버 간 시계 오차 허용 */
const CLOCK_SKEW_SEC = 60;
const MIN_SECRET_LENGTH = 32;
const MAX_TOKEN_LENGTH = 512;

export class ConfigError extends Error {}

export type TokenError = 'invalid_token' | 'token_expired';

export interface TokenBody {
  v: number;
  s: number;
  iat: number;
  /** 심화 진단이면 "adv". 기본이면 없음 */
  l?: 'adv';
}

/** 서명 키. 없거나 짧으면 약한 기본값으로 돌지 않고 바로 실패한다. */
export function readSecret(env: Record<string, string | undefined> = process.env): string {
  const secret = env.REPORT_TOKEN_SECRET;
  if (!secret) throw new ConfigError('REPORT_TOKEN_SECRET 환경 변수가 설정되지 않았습니다.');
  if (secret.length < MIN_SECRET_LENGTH) throw new ConfigError(`REPORT_TOKEN_SECRET은 ${MIN_SECRET_LENGTH}자 이상이어야 합니다.`);
  return secret;
}

const b64u = (b: Buffer) => b.toString('base64url');
const sign = (secret: string, data: string) => createHmac('sha256', secret).update(data).digest();

export const nowSec = () => Math.floor(Date.now() / 1000);

export function newPublicSeed(): number {
  return randomBytes(4).readUInt32BE(0);
}

export function issueToken(secret: string, seed: number, iat = nowSec(), level: 'basic' | 'advanced' = 'basic'): string {
  const fields: TokenBody = level === 'advanced' ? { v: TOKEN_VERSION, s: seed, iat, l: 'adv' } : { v: TOKEN_VERSION, s: seed, iat };
  const body = b64u(Buffer.from(JSON.stringify(fields)));
  return `${body}.${b64u(sign(secret, body))}`;
}

export function verifyToken(secret: string, token: unknown, now = nowSec()): { ok: true; body: TokenBody } | { ok: false; error: TokenError } {
  if (typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH) return { ok: false, error: 'invalid_token' };
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, error: 'invalid_token' };
  const [body, sig] = parts;
  const expected = sign(secret, body);
  const given = Buffer.from(sig, 'base64url');
  // 길이가 다르면 timingSafeEqual이 예외를 던지므로 먼저 거른다
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, error: 'invalid_token' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, error: 'invalid_token' };
  }
  const b = parsed as Partial<TokenBody> | null;
  if (
    !b ||
    typeof b !== 'object' ||
    b.v !== TOKEN_VERSION ||
    !Number.isInteger(b.s) ||
    (b.s as number) < 0 ||
    (b.s as number) > 0xffffffff ||
    !Number.isInteger(b.iat) ||
    ('l' in b && b.l !== 'adv')
  )
    return { ok: false, error: 'invalid_token' };
  const iat = b.iat as number;
  if (iat > now + CLOCK_SKEW_SEC) return { ok: false, error: 'invalid_token' };
  if (now - iat > TOKEN_TTL_SEC) return { ok: false, error: 'token_expired' };
  return { ok: true, body: b.l === 'adv' ? { v: b.v, s: b.s as number, iat, l: 'adv' } : { v: b.v, s: b.s as number, iat } };
}

/**
 * 공개 시드 → 실제 문제 생성 시드 (서명 키가 있어야 계산 가능).
 * 심화는 이름표를 달리해(gen:v1:adv:…) 같은 공개 시드로 기본·심화 문제를 서로 재현할 수 없게 한다. 기본은 이전과 같은 문자열.
 */
export function generationSeed(secret: string, publicSeed: number, level: 'basic' | 'advanced' = 'basic'): number {
  const label = level === 'advanced' ? `gen:v${TOKEN_VERSION}:adv:${publicSeed}` : `gen:v${TOKEN_VERSION}:${publicSeed}`;
  return createHmac('sha256', secret).update(label).digest().readUInt32BE(0);
}
