/**
 * 결제 기능 스위치와 결제사 선택.
 *  - PAYMENTS_ENABLED: 값이 정확히 "true"일 때만 켜짐. 이용권 스위치(MONETIZATION_ENABLED)도 켜져 있어야 의미가 있다.
 *    둘 중 하나라도 꺼져 있으면 결제 API는 없는 경로처럼 404만 돌려준다(이전과 같은 동작).
 *  - PAYMENT_PROVIDER: 쓸 결제사 이름. 지금은 "fake"(가짜 결제사, 시험용)만 있다.
 *    가짜 결제사는 Production(VERCEL_ENV=production)에서 거부한다.
 */
import { monetizationEnabled } from '../config.js';

type Env = Record<string, string | undefined>;

export function paymentsEnabled(env: Env = process.env): boolean {
  return env.PAYMENTS_ENABLED === 'true' && monetizationEnabled(env);
}

export const providerName = (env: Env = process.env) => env.PAYMENT_PROVIDER ?? '';

export const isProduction = (env: Env = process.env) => env.VERCEL_ENV === 'production';
