/**
 * 가짜 결제사(시험용). PAYMENT_PROVIDER=fake이고 Production이 아닐 때만 쓴다. 실제 결제는 일어나지 않는다.
 *
 * 서버리스 함수는 요청 사이에 메모리를 나누지 않으므로, 가짜 결제 내역은 서명한 결제 키 안에 담는다.
 *  - 시험 결제 창에서 결과(성공/실패)를 고르면 /api/payments/fake-approve가 결제 키를 만든다.
 *    결제 키에는 주문번호, "결제창에서 결제한" 금액, 결과가 들어 있고 서버 비밀 값으로 서명된다.
 *  - 결제 확인(confirm)은 결제 키의 서명을 검사하고, 주문번호·금액이 서버가 넘긴 값과 같을 때만 승인한다(실제 결제사의 승인 API를 흉내).
 *  - 웹훅은 본문을 같은 방식으로 서명한 값을 x-fake-signature 헤더로 받는다.
 * 서명 키는 REPORT_TOKEN_SECRET에서 이름표를 달리해 만든다(별도 비밀 값을 두지 않는다).
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readSecret } from '../token.js';
import type { ConfirmResult, PaymentEvent, PaymentProvider } from './provider.js';

type Env = Record<string, string | undefined>;
type Outcome = 'success' | 'fail';

const key = (env: Env, label: string) => createHmac('sha256', readSecret(env)).update(`fake-payments:${label}`).digest();
const mac = (k: Buffer, data: string) => createHmac('sha256', k).update(data).digest('base64url');
const same = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** 시험 결제 창의 결과로 결제 키를 만든다 */
export function fakePaymentKey(env: Env, p: { orderId: string; amount: number; outcome: Outcome }): string {
  const body = Buffer.from(JSON.stringify({ o: p.orderId, a: p.amount, r: p.outcome, n: randomBytes(6).toString('hex') })).toString('base64url');
  return `fake_${body}.${mac(key(env, 'payment-key'), body)}`;
}

function readKey(env: Env, paymentKey: string): { o: string; a: number; r: Outcome } | null {
  const m = /^fake_([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(paymentKey);
  if (!m || !same(mac(key(env, 'payment-key'), m[1]), m[2])) return null;
  try {
    const v = JSON.parse(Buffer.from(m[1], 'base64url').toString());
    return typeof v.o === 'string' && Number.isInteger(v.a) && (v.r === 'success' || v.r === 'fail') ? v : null;
  } catch {
    return null;
  }
}

/** 시험에서 웹훅 본문에 서명할 때 쓴다 */
export const fakeWebhookSignature = (env: Env, rawBody: string) => mac(key(env, 'webhook'), rawBody);

const EVENT_TYPES = new Set(['paid', 'failed', 'canceled', 'refunded']);

export function fakeProvider(env: Env = process.env): PaymentProvider {
  return {
    name: 'fake',
    isTest: true,
    async prepare() {
      return { kind: 'fake' };
    },
    async confirm({ orderId, amount, paymentKey }): Promise<ConfirmResult> {
      const k = readKey(env, paymentKey);
      if (!k) return { status: 'failed', code: 'invalid_payment_key' };
      // 결제창에서 결제한 주문·금액이 승인 요청 값과 다르면 승인하지 않는다(실제 결제사도 같은 검사를 한다)
      if (k.o !== orderId || k.a !== amount) return { status: 'failed', code: 'amount_or_order_mismatch' };
      if (k.r !== 'success') return { status: 'failed', code: 'declined' };
      return { status: 'paid', orderId: k.o, amount: k.a, paymentId: `fake_pay_${createHash('sha256').update(paymentKey).digest('hex').slice(0, 24)}` };
    },
    async cancel() {
      return { ok: true };
    },
    verifyWebhook(rawBody, headers): PaymentEvent | null {
      const sig = headers.get('x-fake-signature') ?? '';
      if (!sig || !same(fakeWebhookSignature(env, rawBody), sig)) return null;
      try {
        const v = JSON.parse(rawBody);
        if (typeof v.eventId !== 'string' || !EVENT_TYPES.has(v.type) || typeof v.orderId !== 'string') return null;
        return {
          eventId: v.eventId,
          type: v.type,
          orderId: v.orderId,
          paymentId: typeof v.paymentId === 'string' ? v.paymentId : null,
          amount: Number.isInteger(v.amount) ? v.amount : null,
        };
      } catch {
        return null;
      }
    },
  };
}
