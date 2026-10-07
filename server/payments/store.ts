/**
 * 주문과 이용권 저장소. 서버(service_role)만 쓴다.
 *
 * 테이블
 *  - payment_orders(새 마이그레이션): 주문번호, 계정 ID, 금액, 상태, 결제사 이름, 결제사 거래 식별자, 만든·바뀐 시각
 *  - entitlements(기존): 계정 ID, 이용권 상태, 구매 시각, 주문번호
 *
 * 상태 바꾸기는 "지금 상태가 from 중 하나일 때만"(조건부 갱신)으로 한다. 같은 확인·웹훅이 동시에 두 번 와도 한 번만 바뀐다.
 *
 * DB 제약에 기대는 곳(supabase/migrations/20261008000000_payment_constraints.sql 등)
 *  - 계정당 pending 주문 1개(부분 유니크 인덱스): 위반하면 createOrder가 ConflictError
 *  - 결제사 거래 식별자 중복 금지(provider_payment_id unique): 위반하면 transition이 ConflictError
 *  - 이용권 계정당 1행(entitlements 기본키 user_id): grantEntitlement는 "이미 있으면 무시"로 넣는다
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
  /** pending 주문 만들기. 같은 계정에 pending 주문이 이미 있으면(DB 유니크 위반) ConflictError */
  createOrder(o: Omit<Order, 'status' | 'paymentId'>): Promise<void>;
  getOrder(orderId: string): Promise<Order | null>;
  /** 이 계정의 pending 주문(있으면 1개) */
  findPendingOrder(userId: string): Promise<Order | null>;
  /**
   * 지금 상태가 from 중 하나일 때만 to로 바꾼다. 바꿨으면 바뀐 주문, 아니면 null.
   * paymentId가 다른 주문에 이미 기록돼 있으면(DB 유니크 위반) ConflictError
   */
  transition(orderId: string, from: OrderStatus[], to: OrderStatus, patch?: { paymentId?: string }): Promise<Order | null>;
  getEntitlement(userId: string): Promise<Entitlement | null>;
  /**
   * 이용권 부여(주문번호·구매 시각 기록). 이미 active 행이 있으면 아무것도 바꾸지 않는다("이미 있으면 무시").
   * 회수된(revoked) 행만 이 주문으로 다시 active로 바꾼다. 부여했으면 true
   */
  grantEntitlement(userId: string, orderId: string): Promise<boolean>;
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
      if (orders.has(o.orderId)) throw new ConflictError();
      // DB의 부분 유니크 인덱스(계정당 pending 1개)와 같은 검사
      if ([...orders.values()].some((x) => x.userId === o.userId && x.status === 'pending')) throw new ConflictError();
      orders.set(o.orderId, { ...o, status: 'pending', paymentId: null });
    },
    async getOrder(id) {
      const o = orders.get(id);
      return o ? { ...o } : null;
    },
    async findPendingOrder(userId) {
      const o = [...orders.values()].find((x) => x.userId === userId && x.status === 'pending');
      return o ? { ...o } : null;
    },
    async transition(id, from, to, patch = {}) {
      const o = orders.get(id);
      if (!o || !from.includes(o.status)) return null;
      // DB의 provider_payment_id 유니크와 같은 검사
      if (patch.paymentId && [...orders.values()].some((x) => x !== o && x.paymentId === patch.paymentId)) throw new ConflictError();
      Object.assign(o, { status: to }, patch.paymentId ? { paymentId: patch.paymentId } : {});
      return { ...o };
    },
    async getEntitlement(userId) {
      const e = ents.get(userId);
      return e ? { status: e.status, orderId: e.orderId } : null;
    },
    async grantEntitlement(userId, orderId) {
      const e = ents.get(userId);
      if (e?.status === 'active') return false;
      grants.push({ userId, orderId });
      ents.set(userId, { status: 'active', orderId, purchasedAt: new Date().toISOString() });
      return true;
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
  const check = <T>(r: { data: T; error: { code?: string } | null }): T => {
    // 23505: 유니크 위반(PostgreSQL). 경합으로 생길 수 있으므로 따로 알린다
    if (r.error) throw r.error.code === '23505' ? new ConflictError() : new StoreError();
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
    async findPendingOrder(userId) {
      const rows = check(await db.from('payment_orders').select(COLS).eq('user_id', userId).eq('status', 'pending').limit(1)) as Row[] | null;
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
      const row = { user_id: userId, status: 'active', purchased_at: new Date().toISOString(), order_id: orderId };
      // 1) 행이 없을 때만 넣는다(insert ... on conflict (user_id) do nothing). 동시에 두 주문이 와도 기본키 때문에 하나만 들어간다
      const ins = check(await db.from('entitlements').upsert(row, { onConflict: 'user_id', ignoreDuplicates: true }).select('user_id')) as unknown[] | null;
      if (ins?.length) return true;
      // 2) 회수된 행만 다시 active로(조건부 갱신). active 행은 건드리지 않는다
      const upd = check(
        await db.from('entitlements').update({ status: 'active', purchased_at: row.purchased_at, order_id: orderId }).eq('user_id', userId).eq('status', 'revoked').select('user_id'),
      ) as unknown[] | null;
      return !!upd?.length;
    },
    async revokeEntitlement(userId, orderId) {
      const rows = check(await db.from('entitlements').update({ status: 'revoked' }).eq('user_id', userId).eq('order_id', orderId).eq('status', 'active').select('user_id')) as unknown[] | null;
      return !!rows?.length;
    },
  };
}

/** 저장소(DB)에 잠시 닿지 않음 → 503 */
export class StoreError extends Error {}
/** DB 유니크 제약 위반(경합). 서비스가 처리하지 못하면 StoreError처럼 503 */
export class ConflictError extends StoreError {}

let override: PaymentStore | null = null;
/** 시험에서 메모리 저장소로 바꿔 끼운다 */
export function setPaymentStoreForTests(s: PaymentStore | null) {
  override = s;
}
export const paymentStore = (): PaymentStore => override ?? supabasePaymentStore();
