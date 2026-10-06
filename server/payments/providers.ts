/** 환경 변수로 결제사를 고른다. 모르는 이름이거나 Production의 가짜 결제사는 설정 오류로 거부한다. */
import { ConfigError } from '../token.js';
import { isProduction, providerName } from './config.js';
import { fakeProvider } from './fake.js';
import type { PaymentProvider } from './provider.js';

type Env = Record<string, string | undefined>;

export function resolveProvider(env: Env = process.env): PaymentProvider {
  const name = providerName(env);
  if (name === 'fake') {
    if (isProduction(env)) throw new ConfigError('가짜 결제사(PAYMENT_PROVIDER=fake)는 Production에서 쓸 수 없습니다.');
    return fakeProvider(env);
  }
  // 실제 결제사 어댑터는 결제사가 정해진 뒤 여기에 연결한다(docs/payments-plan.md)
  throw new ConfigError(name ? `지원하지 않는 결제사입니다: ${name}` : 'PAYMENT_PROVIDER 환경 변수가 설정되지 않았습니다.');
}
