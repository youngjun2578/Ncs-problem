/**
 * 주문과 이용권 저장소. 서버(service_role)만 쓴다.
 *
 * 테이블
 *  - payment_orders(새 마이그레이션): 주문번호, 계정 ID, 금액, 상태, 결제사 이름, 결제사 거래 식별자, 만든·바뀐 시각
 *  - entitlements(기존): 계정 ID, 이용권 상태, 구매 시각, 주문번호
 *
 * 상태 바꾸기는 "지금 상태가 from 중 하나일 때만"(조건부 갱신)으로 한다. 같은 확인·웹훅이 동시에 두 번 와도 한 번만 바뀐다.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ConfigError } from '../token.js';

export type OrderStatus = 'pending' | 'paid' | 'failed' | 'canceled' | 'refunded';

export interface Order {
  orderId: string;
  userId: string;
  amount: number;
  status: OrderStatus;
  provider: string;
  paymentId: string | null;
}

export interface Entitlement {
  status: 'active' | 'revoked';
  orderId: string | null;
}

export interface PaymentStore {
  createOrder(o: Omit<Order, 'status' | 'paymentId'>): Promise<void>;
  getOrder(orderId: string): Promise<Order | null>;
  /** 지금 상태가 from 중 하나일 때만 to로 바꾼다. 바꿨으면 바뀐 주문, 아니면 null */
  transition(orderId: string, from: OrderStatus[], to: OrderStatus, patch?: { paymentId?: string }): Promise<Order | null>;
  getEntitlement(userId: string): Promise<Entitlement | null>;
  /** 이용권 부여(주문번호·구매 시각 기록) */
  grantEntitlement(userId: string, orderId: string): Promise<void>;
  /** 이 주문으로 받은 이용권이면 회수. 회수했으면 true */
  revokeEntitlement(userId: string, orderId: string): Promise<boolean>;
}

/** 시험용 메모리 저장소. grants는 이용권을 부여한 횟수(중복 부여 검사용) */
export function memoryPaymentStore() {
  const orders = new Map<string, Order>();
  const ents = new Map<string, Entitlement & { purchasedAt: string }>();
  const grants: { userId: string; orderId: string }[] = [];
  const store: PaymentStore & { orders: typeof orders; ents: typeof ents; grants: typeof grants } = {
    orders,
    ents,
    grants,
    async createOrder(o) {
      if (orders.has(o.orderId)) throw new Error('주문번호 중복');
      orders.set(o.orderId, { ...o, status: 'pending', paymentId: null });
    },
    async getOrder(id) {
      const o = orders.get(id);
      return o ? { ...o } : null;
    },
    async transition(id, from, to, patch = {}) {
      const o = orders.get(id);
      if (!o || !from.includes(o.status)) return null;
      Object.assign(o, { status: to }, patch.paymentId ? { paymentId: patch.paymentId } : {});
      return { ...o };
    },
    async getEntitlement(userId) {
      const e = ents.get(userId);
      return e ? { status: e.status, orderId: e.orderId } : null;
    },
    async grantEntitlement(userId, orderId) {
      grants.push({ userId, orderId });
      ents.set(userId, { status: 'active', orderId, purchasedAt: new Date().toISOString() });
    },
    async revokeEntitlement(userId, orderId) {
      const e = ents.get(userId);
      if (!e || e.orderId !== orderId || e.status !== 'active') return false;
      e.status = 'revoked';
      return true;
    },
  };
  return store;
}

type Row = { order_id: string; user_id: string; amount: number; status: OrderStatus; provider: string; provider_payment_id: string | null };
const toOrder = (r: Row): Order => ({ orderId: r.order_id, userId: r.user_id, amount: r.amount, status: r.status, provider: r.provider, paymentId: r.provider_payment_id });
const COLS = 'order_id, user_id, amount, status, provider, provider_payment_id';

/** Supabase 저장소. 서비스 키로만 접근한다(RLS 우회). 오류는 예외로 올린다(처리 함수가 503으로 바꾼다) */
export function supabasePaymentStore(env: Record<string, string | undefined> = process.env): PaymentStore {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new ConfigError('SUPABASE_URL(또는 VITE_SUPABASE_URL) 환경 변수가 설정되지 않았습니다.');
  if (!key) throw new ConfigError('SUPABASE_SERVICE_ROLE_KEY 환경 변수가 설정되지 않았습니다.');
  const db: SupabaseClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const check = <T>(r: { data: T; error: unknown }): T => {
    if (r.error) throw new StoreError();
    return r.data;
  };
  return {
    async createOrder(o) {
      check(await db.from('payment_orders').insert({ order_id: o.orderId, user_id: o.userId, amount: o.amount, status: 'pending', provider: o.provider }));
    },
    async getOrder(id) {
      const rows = check(await db.from('payment_orders').select(COLS).eq('order_id', id).limit(1)) as Row[] | null;
      return rows?.[0] ? toOrder(rows[0]) : null;
    },
    async transition(id, from, to, patch = {}) {
      const set: Record<string, unknown> = { status: to, updated_at: new Date().toISOString() };
      if (patch.paymentId) set.provider_payment_id = patch.paymentId;
      const rows = check(await db.from('payment_orders').update(set).eq('order_id', id).in('status', from).select(COLS)) as Row[] | null;
      return rows?.[0] ? toOrder(rows[0]) : null;
    },
    async getEntitlement(userId) {
      const rows = check(await db.from('entitlements').select('status, order_id').eq('user_id', userId).limit(1)) as { status: 'active' | 'revoked'; order_id: string | null }[] | null;
      return rows?.[0] ? { status: rows[0].status, orderId: rows[0].order_id } : null;
    },
    async grantEntitlement(userId, orderId) {
      check(
        await db
          .from('entitlements')
          .upsert({ user_id: userId, status: 'active', purchased_at: new Date().toISOString(), order_id: orderId }, { onConflict: 'user_id' }),
      );
    },
    async revokeEntitlement(userId, orderId) {
      const rows = check(await db.from('entitlements').update({ status: 'revoked' }).eq('user_id', userId).eq('order_id', orderId).eq('status', 'active').select('user_id')) as unknown[] | null;
      return !!rows?.length;
    },
  };
}

/** 저장소(DB)에 잠시 닿지 않음 → 503 */
export class StoreError extends Error {}

let override: PaymentStore | null = null;
/** 시험에서 메모리 저장소로 바꿔 끼운다 */
export function setPaymentStoreForTests(s: PaymentStore | null) {
  override = s;
}
export const paymentStore = (): PaymentStore => override ?? supabasePaymentStore();
