/**
 * 결제 흐름. 금액·상품은 서버 상수만 쓰고, 브라우저가 보낸 값은 비교용으로만 본다.
 *
 * 주문 상태
 *   pending ─(결제 확인 성공·paid 웹훅)→ paid ─(환불·취소 웹훅·refundOrder)→ refunded
 *   pending ─(결제 확인 실패·failed 웹훅)→ failed
 *   pending ─(결제창에서 취소·canceled 웹훅)→ canceled
 * 이용권은 pending → paid로 바뀐 그 한 번에만 부여하고, paid → refunded로 바뀐 그 한 번에만 회수한다.
 *
 * 중복·동시성(사용자 결정: 계정당 pending 주문 1개, 중복 결제는 표시만 하고 운영자가 처리, 자동 환불 없음)
 *  - 주문 만들기: 같은 계정에 pending 주문이 있으면 새로 만들지 않고 그 주문을 이어서 쓴다(DB 부분 유니크 인덱스가 최종 방어)
 *  - 이용권: "이미 있으면 무시"로 넣는다. 같은 계정의 두 주문이 동시에 확인돼도 이용권은 한 번만 부여되고,
 *    나중 주문은 paid로만 남는다(duplicate). 운영자가 찾는 조회문은 docs/payments-plan.md
 */
import { randomBytes } from 'node:crypto';
import { PASS_PRICE_KRW } from '../../shared/product.js';
import type { PaymentEvent, PaymentProvider } from './provider.js';
import { ConflictError, type Order, type PaymentStore } from './store.js';

/** 이용권 상품 이름(결제창 표시용) */
export const ORDER_NAME = 'NCS 수리능력 진단 이용권';

const STALE_PENDING = '결제가 끝나지 않은 이전 주문이 있어 새 주문을 만들 수 없습니다. 문의해 주세요.';

/** 주문번호: 서버가 만든다. 영문·숫자·밑줄·하이픈 34자 */
export const newOrderId = () => `ncs_${Date.now().toString(36)}_${randomBytes(12).toString('base64url').replace(/[^A-Za-z0-9]/g, '0')}`;

export type ServiceError =
  | { error: 'already_entitled' }
  | { error: 'order_not_found' }
  | { error: 'order_forbidden' }
  | { error: 'amount_mismatch' }
  | { error: 'order_state'; message?: string }
  | { error: 'payment_conflict' }
  | { error: 'provider_unavailable' };

/**
 * 주문 만들기: 로그인한 계정만(처리 함수가 확인), 이미 이용권이 있으면 만들지 않는다.
 * 같은 계정에 pending 주문이 있으면 그 주문을 그대로 돌려준다(resumed: true). 결제창을 닫고 다시 열어도 막히지 않게 하려는 것.
 * 남아 있는 pending 주문의 금액·결제사가 지금 값과 다르면(가격·결제사를 바꾼 뒤) 이어 쓰지 않고 409 order_state.
 */
export async function createOrder(store: PaymentStore, provider: PaymentProvider, userId: string) {
  const ent = await store.getEntitlement(userId);
  if (ent?.status === 'active') return { error: 'already_entitled' } as const;
  const respond = async (o: { orderId: string; amount: number }, resumed: boolean) => {
    const checkout = await provider.prepare({ orderId: o.orderId, amount: o.amount, orderName: ORDER_NAME });
    return { orderId: o.orderId, amount: o.amount, orderName: ORDER_NAME, test: provider.isTest, checkout, resumed };
  };
  const resume = (o: Order) => (o.amount === PASS_PRICE_KRW && o.provider === provider.name ? respond(o, true) : ({ error: 'order_state', message: STALE_PENDING } as const));

  const pending = await store.findPendingOrder(userId);
  if (pending) return resume(pending);
  const order = { orderId: newOrderId(), userId, amount: PASS_PRICE_KRW, provider: provider.name };
  try {
    await store.createOrder(order);
  } catch (e) {
    // 같은 계정의 주문 요청이 동시에 들어와 다른 요청이 먼저 pending 주문을 만든 경우(유니크 위반): 그 주문을 이어 쓴다
    if (!(e instanceof ConflictError)) throw e;
    const won = await store.findPendingOrder(userId);
    if (!won) throw e;
    return resume(won);
  }
  return respond(order, false);
}

/**
 * 결제가 확인된 주문을 paid로 바꾸고 이용권을 준다. pending일 때만 바뀌므로 여러 번 불려도 한 번만 반영된다.
 * 이미 다른 주문으로 이용권이 있으면 이용권은 그대로 두고 duplicate로 알린다(처리 방침은 결정 필요: docs/payments-plan.md).
 */
async function markPaid(store: PaymentStore, order: Order, paymentId: string) {
  let moved: Order | null;
  try {
    moved = await store.transition(order.orderId, ['pending'], 'paid', { paymentId });
  } catch (e) {
    // 결제사 거래 식별자가 이미 다른 주문에 기록됨(DB 유니크 위반): 이 주문은 실패로 닫고 이용권을 주지 않는다
    if (!(e instanceof ConflictError)) throw e;
    await store.transition(order.orderId, ['pending'], 'failed');
    return { applied: false, duplicate: false, conflict: true };
  }
  if (!moved) return { applied: false, duplicate: false, conflict: false };
  // 이미 있으면 무시: 같은 계정의 다른 주문이 먼저(또는 동시에) 이용권을 받았으면 이 주문은 paid로만 남는다
  const granted = await store.grantEntitlement(order.userId, order.orderId);
  return { applied: true, duplicate: !granted, conflict: false };
}

/** 환불·취소된 주문을 refunded로 바꾸고, 그 주문으로 받은 이용권을 회수한다 */
async function markRefunded(store: PaymentStore, order: Order) {
  const moved = await store.transition(order.orderId, ['paid'], 'refunded');
  if (!moved) return { applied: false, revoked: false };
  return { applied: true, revoked: await store.revokeEntitlement(order.userId, order.orderId) };
}

/**
 * 결제 확인: 결제창에서 돌아온 결제 키로 결제사에 직접 물어본 뒤에만 이용권을 준다.
 * 주문의 계정·금액·상태가 모두 맞아야 하고, 결제사가 알려 준 주문번호·금액도 주문과 같아야 한다.
 */
export async function confirmPayment(store: PaymentStore, provider: PaymentProvider, userId: string, input: { orderId: string; paymentKey: string; amount: number }) {
  const order = await store.getOrder(input.orderId);
  if (!order) return { error: 'order_not_found' } as const;
  if (order.userId !== userId) return { error: 'order_forbidden' } as const;
  if (input.amount !== order.amount) return { error: 'amount_mismatch' } as const;
  // 이미 확인된 주문: 결제사를 다시 부르지 않고 같은 결과를 돌려준다(이용권은 다시 주지 않음)
  if (order.status === 'paid') return { status: 'paid' as const, alreadyConfirmed: true, duplicate: false };
  if (order.status !== 'pending') return { error: 'order_state' } as const;

  const r = await provider.confirm({ orderId: order.orderId, amount: order.amount, paymentKey: input.paymentKey });
  if (r.status === 'unavailable') return { error: 'provider_unavailable' } as const;
  if (r.status === 'failed') {
    await store.transition(order.orderId, ['pending'], 'failed');
    return { status: 'failed' as const, code: r.code };
  }
  // 결제사가 승인했다고 해도 주문번호·금액이 주문과 다르면 이용권을 주지 않는다
  if (r.orderId !== order.orderId || r.amount !== order.amount) {
    await store.transition(order.orderId, ['pending'], 'failed');
    return { error: 'amount_mismatch' } as const;
  }
  const m = await markPaid(store, order, r.paymentId);
  if (m.conflict) return { error: 'payment_conflict' } as const;
  if (!m.applied) {
    // 동시에 다른 요청(확인·웹훅)이 먼저 반영함
    const now = await store.getOrder(order.orderId);
    return now?.status === 'paid' ? { status: 'paid' as const, alreadyConfirmed: true, duplicate: false } : ({ error: 'order_state' } as const);
  }
  return { status: 'paid' as const, alreadyConfirmed: false, duplicate: m.duplicate };
}

/** 결제창에서 취소: 본인의 결제 전(pending) 주문만 canceled로 */
export async function cancelPendingOrder(store: PaymentStore, userId: string, orderId: string) {
  const order = await store.getOrder(orderId);
  if (!order) return { error: 'order_not_found' } as const;
  if (order.userId !== userId) return { error: 'order_forbidden' } as const;
  const moved = await store.transition(orderId, ['pending'], 'canceled');
  return { status: moved ? ('canceled' as const) : order.status };
}

/**
 * 웹훅 반영. 서명 검증은 처리 함수가 결제사 어댑터로 먼저 한다.
 * 같은 알림이 다시 와도 상태 조건 때문에 한 번만 반영된다(applied: false).
 */
export async function applyEvent(store: PaymentStore, ev: PaymentEvent) {
  const order = await store.getOrder(ev.orderId);
  if (!order) return { applied: false, reason: 'order_not_found' };
  if (ev.amount !== null && ev.amount !== order.amount) return { applied: false, reason: 'amount_mismatch' };
  if (ev.type === 'paid') {
    if (!ev.paymentId) return { applied: false, reason: 'payment_id_missing' };
    const m = await markPaid(store, order, ev.paymentId);
    return m.conflict ? { applied: false, reason: 'payment_id_conflict' } : { applied: m.applied, duplicate: m.duplicate };
  }
  if (ev.type === 'failed') return { applied: !!(await store.transition(order.orderId, ['pending'], 'failed')) };
  // canceled·refunded: 결제 전이면 취소, 결제 뒤면 환불(이용권 회수)
  if (order.status === 'pending') return { applied: !!(await store.transition(order.orderId, ['pending'], 'canceled')) };
  const r = await markRefunded(store, order);
  return { applied: r.applied, revoked: r.revoked };
}

/**
 * 환불(운영자용, 화면·API 없음): 결제사에 취소를 요청하고 성공하면 refunded로 바꾸고 이용권을 회수한다.
 * 결제사 관리 화면에서 직접 환불한 경우에는 웹훅(refunded)으로 같은 결과가 된다.
 */
export async function refundOrder(store: PaymentStore, provider: PaymentProvider, orderId: string, reason: string) {
  const order = await store.getOrder(orderId);
  if (!order) return { error: 'order_not_found' } as const;
  if (order.status !== 'paid' || !order.paymentId) return { error: 'order_state' } as const;
  const c = await provider.cancel({ paymentId: order.paymentId, amount: order.amount, reason });
  if (!c.ok) return { error: 'provider_unavailable' } as const;
  const r = await markRefunded(store, order);
  return { status: 'refunded' as const, revoked: r.revoked };
}
