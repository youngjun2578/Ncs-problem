/**
 * 결제 HTTP 처리 함수. Vercel 함수(api/payments/*.ts)와 개발 서버(vite.config.ts)가 같은 함수를 쓴다.
 * 결제 스위치(PAYMENTS_ENABLED)와 이용권 스위치(MONETIZATION_ENABLED)가 모두 켜져 있지 않으면 없는 경로처럼 404만 돌려준다.
 *
 * 요청 본문에서 읽는 값은 주문번호·결제 키·금액(비교용)뿐이다. 금액·상품·이용권 값은 서버가 정한다.
 * 개인정보: 요청 본문과 결제 키는 로그에 남기지 않는다.
 */
import { accountService } from '../accounts.js';
import { apiError, bearer, fail, json, readJson } from '../handlers.js';
import { paymentsEnabled } from './config.js';
import { fakePaymentKey } from './fake.js';
import { resolveProvider } from './providers.js';
import { applyEvent, cancelPendingOrder, confirmPayment, createOrder } from './service.js';
import { paymentStore, StoreError } from './store.js';

const MAX_WEBHOOK_BYTES = 16 * 1024;
const ORDER_ID = /^[A-Za-z0-9_-]{6,64}$/;

/** 스위치·요청 방식 확인. 통과하면 null */
function gate(req: Request): Response | null {
  if (!paymentsEnabled()) return apiError('not_found');
  if (req.method !== 'POST') return apiError('method_not_allowed');
  return null;
}

/** 로그인 토큰으로 계정 ID를 얻는다. 토큰이 없거나 틀리면 401 */
async function userIdOf(req: Request): Promise<string | Response> {
  const token = bearer(req);
  if (!token) return apiError('auth_invalid');
  const v = await accountService().verify(token);
  if (!v.ok) return apiError(v.reason === 'invalid' ? 'auth_invalid' : 'service_unavailable');
  return v.userId;
}

const body = async (req: Request): Promise<Record<string, unknown> | Response> => {
  const b = await readJson(req);
  if (!b.ok) return b.res;
  if (!b.value || typeof b.value !== 'object' || Array.isArray(b.value)) return apiError('bad_request', '요청 본문은 객체여야 합니다.');
  return b.value as Record<string, unknown>;
};

function wrap(where: string, f: () => Promise<Response>): Promise<Response> {
  return f().catch((e) => (e instanceof StoreError ? apiError('service_unavailable') : fail(where, e)));
}

const toResponse = (r: { error?: string } & Record<string, unknown>) =>
  'error' in r && r.error ? apiError(r.error === 'provider_unavailable' ? 'payment_unavailable' : (r.error as Parameters<typeof apiError>[0])) : json(200, r);

/** POST /api/payments/order: 주문 만들기(로그인 필요). 응답: 주문번호, 금액(서버 상수), 상품 이름, 시험 결제 여부, 결제창 정보 */
export function handlePaymentOrder(req: Request): Promise<Response> {
  return wrap('payments-order', async () => {
    const g = gate(req);
    if (g) return g;
    const provider = resolveProvider();
    const uid = await userIdOf(req);
    if (uid instanceof Response) return uid;
    return toResponse(await createOrder(paymentStore(), provider, uid));
  });
}

/** POST /api/payments/confirm: 결제 확인(로그인 필요). 본문 { orderId, paymentKey, amount } */
export function handlePaymentConfirm(req: Request): Promise<Response> {
  return wrap('payments-confirm', async () => {
    const g = gate(req);
    if (g) return g;
    const provider = resolveProvider();
    const uid = await userIdOf(req);
    if (uid instanceof Response) return uid;
    const b = await body(req);
    if (b instanceof Response) return b;
    const { orderId, paymentKey, amount } = b;
    if (typeof orderId !== 'string' || !ORDER_ID.test(orderId) || typeof paymentKey !== 'string' || paymentKey.length > 2048 || !Number.isInteger(amount))
      return apiError('bad_request', 'orderId, paymentKey, amount가 필요합니다.');
    return toResponse(await confirmPayment(paymentStore(), provider, uid, { orderId, paymentKey, amount: amount as number }));
  });
}

/** POST /api/payments/cancel: 결제창에서 취소한 결제 전 주문을 닫는다(로그인 필요). 본문 { orderId } */
export function handlePaymentCancel(req: Request): Promise<Response> {
  return wrap('payments-cancel', async () => {
    const g = gate(req);
    if (g) return g;
    resolveProvider();
    const uid = await userIdOf(req);
    if (uid instanceof Response) return uid;
    const b = await body(req);
    if (b instanceof Response) return b;
    if (typeof b.orderId !== 'string' || !ORDER_ID.test(b.orderId)) return apiError('bad_request', 'orderId가 필요합니다.');
    return toResponse(await cancelPendingOrder(paymentStore(), uid, b.orderId));
  });
}

/**
 * POST /api/payments/fake-approve: 가짜 결제사의 "결제창"(시험용). 결과를 고르면 결제 키를 만든다.
 * 이것만으로는 아무것도 바뀌지 않는다. 결제 확인(confirm)을 거쳐야 주문·이용권이 바뀐다.
 * 가짜 결제사가 아니면 404. 본문 { orderId, amount, outcome: "success" | "fail" }
 */
export function handlePaymentFakeApprove(req: Request): Promise<Response> {
  return wrap('payments-fake-approve', async () => {
    const g = gate(req);
    if (g) return g;
    if (resolveProvider().name !== 'fake') return apiError('not_found');
    const b = await body(req);
    if (b instanceof Response) return b;
    const { orderId, amount, outcome } = b;
    if (typeof orderId !== 'string' || !ORDER_ID.test(orderId) || !Number.isInteger(amount) || (outcome !== 'success' && outcome !== 'fail'))
      return apiError('bad_request', 'orderId, amount, outcome이 필요합니다.');
    return json(200, { paymentKey: fakePaymentKey(process.env, { orderId, amount: amount as number, outcome }) });
  });
}

/** POST /api/payments/webhook: 결제사 알림. 서명이 틀리면 401. 같은 알림이 다시 와도 한 번만 반영 */
export function handlePaymentWebhook(req: Request): Promise<Response> {
  return wrap('payments-webhook', async () => {
    const g = gate(req);
    if (g) return g;
    const provider = resolveProvider();
    const raw = await req.text();
    if (Buffer.byteLength(raw) > MAX_WEBHOOK_BYTES) return apiError('payload_too_large');
    const ev = provider.verifyWebhook(raw, req.headers);
    if (!ev) return apiError('webhook_invalid');
    const r = await applyEvent(paymentStore(), ev);
    return json(200, { received: true, ...r });
  });
}
