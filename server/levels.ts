/**
 * 진단 수준(기본/심화)과 심화 이용 정책.
 *
 * - 서버 스위치 ADVANCED_LEVEL_ENABLED가 "true"가 아니면 심화는 없다(기본만, 이전과 같음).
 * - 심화를 쓸 수 있는지는 advancedAccess 한 곳에서만 정한다.
 *   지금 정책: 스위치가 켜져 있으면 누구나 무료(정책 A).
 *   "이용권 전용"으로 바꿀 때는 이 함수만 고친다(예: server/accounts.ts로 토큰·이용권 확인).
 */
import type { DiagnosisLevel } from '../shared/api.js';

export type { DiagnosisLevel };

/** 서버 기능 스위치. "true"일 때만 심화를 만든다. */
export function advancedLevelEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.ADVANCED_LEVEL_ENABLED === 'true';
}

export type AdvancedAccess = 'ok' | 'disabled';

/**
 * 심화 이용 가능 여부. 세션을 만들 때와 채점할 때 모두 이 함수로 판단한다.
 * req는 지금 정책에서는 쓰지 않지만, 이용권 확인으로 바꿀 때 필요하다.
 */
export async function advancedAccess(_req: Request, env: Record<string, string | undefined> = process.env): Promise<AdvancedAccess> {
  return advancedLevelEnabled(env) ? 'ok' : 'disabled';
}

/**
 * 세션 요청 본문에서 level을 읽는다.
 *  - 본문이 없거나 JSON 객체가 아니거나 level 키가 없으면 기본(이전과 같은 동작)
 *  - "basic" / "advanced"는 그대로
 *  - 그 밖의 값(문자열이 아니거나 모르는 값)은 오류: 오타를 조용히 기본으로 바꾸면 심화를 요청한 화면이 기본 문제를 받게 된다
 */
export function parseLevel(body: unknown): { ok: true; level: DiagnosisLevel } | { ok: false } {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !('level' in body)) return { ok: true, level: 'basic' };
  const v = (body as { level: unknown }).level;
  if (v === 'basic' || v === 'advanced') return { ok: true, level: v };
  return { ok: false };
}
