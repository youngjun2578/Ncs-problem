/**
 * 로그인 토큰 검증과 이용권 조회 (Supabase).
 * 서비스 키(SUPABASE_SERVICE_ROLE_KEY)는 여기서만 읽는다. 브라우저 코드에서 이 파일을 import하지 않는다.
 *
 * 결과는 세 가지로만 나눈다.
 *  - 성공
 *  - invalid: 토큰이 틀렸거나 만료됨 → 401 (다시 로그인)
 *  - unavailable: 인증 서버·DB에 잠시 닿지 않음 → 503 (다시 시도). 무료/유료 어느 쪽으로도 처리하지 않는다.
 */
import { createClient, isAuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js';
import { ConfigError } from './token.js';

export type VerifyResult = { ok: true; userId: string } | { ok: false; reason: 'invalid' | 'unavailable' };
export type EntitlementResult = { ok: true; active: boolean } | { ok: false };

export interface AccountService {
  verify(accessToken: string): Promise<VerifyResult>;
  entitlement(userId: string): Promise<EntitlementResult>;
  /** 이용권 행과 Supabase 사용자 계정을 지운다 */
  deleteAccount(userId: string): Promise<{ ok: boolean }>;
}

/** 인증 서버 응답이 이 상태 코드면 토큰 문제로 본다. 그 밖(5xx, 429, 연결 실패)은 일시 장애로 본다. */
const INVALID_TOKEN_STATUS = new Set([400, 401, 403, 404]);

function supabaseAdmin(env: Record<string, string | undefined>): SupabaseClient {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new ConfigError('SUPABASE_URL(또는 VITE_SUPABASE_URL) 환경 변수가 설정되지 않았습니다.');
  if (!key) throw new ConfigError('SUPABASE_SERVICE_ROLE_KEY 환경 변수가 설정되지 않았습니다.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

export function supabaseAccountService(env: Record<string, string | undefined> = process.env): AccountService {
  const db = supabaseAdmin(env);
  return {
    async verify(accessToken) {
      try {
        // 인증 서버에 직접 물어본다(서명 방식과 무관하게 동작, 로그아웃·삭제된 세션도 거부됨)
        const { data, error } = await db.auth.getUser(accessToken);
        if (!error && data.user) return { ok: true, userId: data.user.id };
        if (error && !isAuthRetryableFetchError(error) && INVALID_TOKEN_STATUS.has(error.status ?? 0)) return { ok: false, reason: 'invalid' };
        return { ok: false, reason: 'unavailable' };
      } catch {
        return { ok: false, reason: 'unavailable' };
      }
    },
    async entitlement(userId) {
      try {
        const { data, error } = await db.from('entitlements').select('status').eq('user_id', userId).limit(1);
        if (error || !Array.isArray(data)) return { ok: false };
        return { ok: true, active: data[0]?.status === 'active' };
      } catch {
        return { ok: false };
      }
    },
    async deleteAccount(userId) {
      try {
        // auth.users 삭제 시 on delete cascade로도 지워지지만, 순서를 분명히 하려고 먼저 지운다
        const del = await db.from('entitlements').delete().eq('user_id', userId);
        if (del.error) return { ok: false };
        const { error } = await db.auth.admin.deleteUser(userId);
        return { ok: !error };
      } catch {
        return { ok: false };
      }
    },
  };
}

let override: AccountService | null = null;

/** 테스트에서 모의 서비스로 바꿔 끼운다 */
export function setAccountServiceForTests(s: AccountService | null) {
  override = s;
}

export function accountService(): AccountService {
  return override ?? supabaseAccountService();
}
