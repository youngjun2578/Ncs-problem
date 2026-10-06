/**
 * 결제 뼈대 시험(가짜 결제사). 실패하면 exit 1.
 *   npx tsx scripts/payments-test.ts
 *
 * 같은 시나리오를 저장소 두 가지로 돌린다.
 *  - memory: 메모리 저장소(server/payments/store.ts의 memoryPaymentStore)
 *  - supabase: 실제 supabase-js 코드 경로(supabasePaymentStore) + 모의 Supabase(scripts/mock-supabase.ts)
 * 로그인 토큰 검증은 두 경우 모두 모의 Supabase로 한다(server/accounts.ts 그대로).
 *
 *  (a) 정상 결제 → 이용권 부여      (b) 금액 변조 거부           (c) 다른 계정 주문 확인 거부
 *  (d) 같은 주문 중복 확인 → 이용권 1회  (e) 결제 실패·취소 → 이용권 없음  (f) 환불 → 회수
 *  (g) 웹훅 서명 불일치 거부, 재전송 1회 반영  (h) 로그인 없는 요청 거부
 *  (i) 결제 스위치 꺼짐 → 결제 API 없음(404)  (j) Production에서 가짜 결제사 거부
 */
import { spawnSync } from 'node:child_process';
import {
  handlePaymentCancel,
  handlePaymentConfirm,
  handlePaymentFakeApprove,
  handlePaymentOrder,
  handlePaymentWebhook,
} from '../server/payments/handlers.js';
import { handleReport, handleSession } from '../server/handlers.js';
import { fakeWebhookSignature } from '../server/payments/fake.js';
import { resolveProvider } from '../server/payments/providers.js';
import { refundOrder } from '../server/payments/service.js';
import { memoryPaymentStore, paymentStore, setPaymentStoreForTests } from '../server/payments/store.js';
import { PASS_PRICE_KRW } from '../shared/product.js';
import { generationSeed, verifyToken } from '../server/token.js';
import { generateQuestions } from '../server/diagnosis.js';
import type { ReportResponse, SessionResponse } from '../shared/api.js';
import { MOCK_SERVICE_KEY, MOCK_USERS, startMockSupabase, userToken } from './mock-supabase.js';

const SECRET = 'payments-test-secret-0123456789-abcdefgh';
let passed = 0;
let failed = 0;
let mode = '';
const ok = (c: unknown, m: string) => {
  if (c) passed++;
  else {
    failed++;
    console.log(`FAIL [${mode}] ${m}`);
  }
};

const mock = await startMockSupabase(0);
const reset = () => fetch(`${mock.url}/__mock/state`, { method: 'POST', body: JSON.stringify({ reset: true }) });

const BASE_ENV = {
  REPORT_TOKEN_SECRET: SECRET,
  MONETIZATION_ENABLED: 'true',
  PAYMENTS_ENABLED: 'true',
  PAYMENT_PROVIDER: 'fake',
  VITE_SUPABASE_URL: mock.url,
  SUPABASE_SERVICE_ROLE_KEY: MOCK_SERVICE_KEY,
};
const KEYS = [...Object.keys(BASE_ENV), 'VERCEL_ENV'];
function setEnv(over: Record<string, string | undefined> = {}) {
  for (const k of KEYS) delete process.env[k];
  for (const [k, v] of Object.entries({ ...BASE_ENV, ...over })) if (v !== undefined) process.env[k] = v;
}

type User = { id: string; auth: () => string };
const A: User = { id: MOCK_USERS.google.id, auth: () => `Bearer ${userToken('google')}` };
const B: User = { id: MOCK_USERS.kakao.id, auth: () => `Bearer ${userToken('kakao')}` };

type H = (r: Request) => Promise<Response>;
async function call(h: H, body: unknown, auth?: string, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...extra };
  if (auth) headers.authorization = auth;
  const r = await h(new Request('http://x/api/payments', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) }));
  const text = await r.text();
  return { status: r.status, json: (text ? JSON.parse(text) : {}) as Record<string, any> };
}
const order = (u = A, body: unknown = {}) => call(handlePaymentOrder, body, u.auth());
const approve = (orderId: string, amount: number, outcome: 'success' | 'fail' = 'success') => call(handlePaymentFakeApprove, { orderId, amount, outcome });
const confirm = (u: User, orderId: string, paymentKey: string, amount: number) => call(handlePaymentConfirm, { orderId, paymentKey, amount }, u.auth());
function webhook(ev: Record<string, unknown>, sign = true) {
  const raw = JSON.stringify(ev);
  return call(handlePaymentWebhook, raw, undefined, { 'x-fake-signature': sign ? fakeWebhookSignature(process.env, raw) : 'bad-signature' });
}

// 저장소별 상태 읽기
let mem: ReturnType<typeof memoryPaymentStore> | null = null;
const ent = async (uid: string) => paymentStore().getEntitlement(uid);
const ord = async (id: string) => paymentStore().getOrder(id);
/** 이용권을 부여한 횟수(메모리: 기록, supabase: 모의 서버에 들어온 entitlements POST 수) */
const grants = (uid: string) => (mem ? mem.grants.filter((g) => g.userId === uid).length : mock.state.calls.filter((c) => c === 'POST /rest/v1/entitlements').length);

async function fresh() {
  await reset();
  setEnv();
  mem = mode === 'memory' ? memoryPaymentStore() : null;
  setPaymentStoreForTests(mem);
}

/** 정상 흐름 한 번: 주문 → 시험 결제 성공 → 확인 */
async function payOnce(u = A) {
  const o = await order(u);
  const k = await approve(o.json.orderId, o.json.amount);
  const c = await confirm(u, o.json.orderId, k.json.paymentKey, o.json.amount);
  return { o, k, c, orderId: o.json.orderId as string };
}

async function scenarios() {
  // (a) 정상 결제 → 이용권 부여
  await fresh();
  {
    const o = await order(A, { amount: 1, price: 1, product: 'free', orderId: 'client-made-id' });
    ok(o.status === 200 && o.json.amount === PASS_PRICE_KRW && o.json.test === true && o.json.checkout?.kind === 'fake', `(a) 주문: 200, 금액은 서버 상수 ${PASS_PRICE_KRW}, 시험 결제 (${o.status} ${o.json.amount})`);
    ok(o.json.orderId !== 'client-made-id' && /^ncs_/.test(o.json.orderId), '(a) 주문번호는 서버가 만든다(본문 값 무시)');
    ok((await ord(o.json.orderId))?.status === 'pending' && (await ord(o.json.orderId))?.userId === A.id, '(a) 주문 저장: pending, 계정 A');
    const k = await approve(o.json.orderId, o.json.amount);
    ok(k.status === 200 && typeof k.json.paymentKey === 'string', '(a) 시험 결제창: 결제 키 발급');
    ok((await ent(A.id)) === null, '(a) 결제 키만으로는 이용권이 생기지 않음');
    const c = await confirm(A, o.json.orderId, k.json.paymentKey, o.json.amount);
    ok(c.status === 200 && c.json.status === 'paid' && c.json.alreadyConfirmed === false, `(a) 확인: paid (${c.status} ${JSON.stringify(c.json)})`);
    const e = await ent(A.id);
    ok(e?.status === 'active' && e.orderId === o.json.orderId, '(a) 이용권 active, 주문번호 기록');
    const st = await ord(o.json.orderId);
    ok(st?.status === 'paid' && !!st.paymentId, '(a) 주문 paid, 결제사 거래 식별자 기록');
    ok(grants(A.id) === 1, `(a) 이용권 부여 1회 (${grants(A.id)})`);
    const again = await order(A);
    ok(again.status === 409 && again.json.error === 'already_entitled', '(a) 이미 이용권이 있으면 새 주문 409');
    if (mode === 'supabase') {
      // 채점 응답도 이용권 범위로 바뀌는지(기존 이용권 확인 경로)
      const s = (await (await handleSession(new Request('http://x/api/session', { method: 'POST' }))).json()) as SessionResponse;
      const v = verifyToken(SECRET, s.token);
      const qs = generateQuestions(generationSeed(SECRET, v.ok ? v.body.s : 0));
      const r = await handleReport(
        new Request('http://x/api/report', { method: 'POST', headers: { 'content-type': 'application/json', authorization: A.auth() }, body: JSON.stringify({ token: s.token, answers: qs.map((q) => q.answerIndex), secs: qs.map(() => 1) }) }),
      );
      const j = (await r.json()) as ReportResponse;
      ok(r.status === 200 && j.gated === false && j.explanations.length === 12, '(a) 결제 뒤 채점 응답은 이용권 범위(gated false, 해설 12개)');
    }
  }

  // (b) 금액 변조 거부
  await fresh();
  {
    const o = await order(B);
    const k100 = await approve(o.json.orderId, 100);
    const c1 = await confirm(B, o.json.orderId, k100.json.paymentKey, 100);
    ok(c1.status === 400 && c1.json.error === 'amount_mismatch', `(b) 결제창 금액·확인 금액을 모두 100원으로 바꿈 → 400 amount_mismatch (${c1.status})`);
    ok((await ent(B.id)) === null && (await ord(o.json.orderId))?.status === 'pending', '(b) 이용권 없음, 주문은 pending 그대로');
    const c2 = await confirm(B, o.json.orderId, k100.json.paymentKey, PASS_PRICE_KRW);
    ok(c2.status === 200 && c2.json.status === 'failed', `(b) 결제창에서 100원만 결제하고 확인은 정가로 → 결제사가 승인하지 않음(failed) (${JSON.stringify(c2.json)})`);
    ok((await ent(B.id)) === null && grants(B.id) === 0, '(b) 이용권 없음');
    const o2 = await order(B);
    const forged = await confirm(B, o2.json.orderId, 'fake_eyJvIjoieCJ9.forged', PASS_PRICE_KRW);
    ok(forged.status === 200 && forged.json.status === 'failed' && (await ent(B.id)) === null, '(b) 위조 결제 키 → failed, 이용권 없음');
  }

  // (c) 다른 계정 주문 확인 거부
  await fresh();
  {
    const o = await order(B);
    const k = await approve(o.json.orderId, o.json.amount);
    const c = await confirm(A, o.json.orderId, k.json.paymentKey, o.json.amount);
    ok(c.status === 403 && c.json.error === 'order_forbidden', `(c) 계정 A가 B의 주문 확인 → 403 (${c.status})`);
    ok((await ent(A.id)) === null && (await ent(B.id)) === null && (await ord(o.json.orderId))?.status === 'pending', '(c) A·B 모두 이용권 없음, 주문 pending');
    const cc = await call(handlePaymentCancel, { orderId: o.json.orderId }, A.auth());
    ok(cc.status === 403 && (await ord(o.json.orderId))?.status === 'pending', '(c) 계정 A가 B의 주문 취소 → 403');
    const own = await confirm(B, o.json.orderId, k.json.paymentKey, o.json.amount);
    ok(own.status === 200 && own.json.status === 'paid' && (await ent(B.id))?.status === 'active', '(c) 주인 B의 확인은 정상');
  }

  // (d) 같은 주문 중복 확인 → 이용권 1회
  await fresh();
  {
    const p = await payOnce(A);
    const again = await confirm(A, p.orderId, p.k.json.paymentKey, PASS_PRICE_KRW);
    ok(again.status === 200 && again.json.status === 'paid' && again.json.alreadyConfirmed === true, '(d) 두 번째 확인: paid, alreadyConfirmed');
    const both = await Promise.all([confirm(A, p.orderId, p.k.json.paymentKey, PASS_PRICE_KRW), confirm(A, p.orderId, p.k.json.paymentKey, PASS_PRICE_KRW)]);
    ok(both.every((r) => r.json.status === 'paid'), '(d) 동시에 두 번 더 확인해도 paid');
    const wh = await webhook({ eventId: 'ev-dup', type: 'paid', orderId: p.orderId, paymentId: 'fake_pay_x', amount: PASS_PRICE_KRW });
    ok(wh.status === 200 && wh.json.applied === false, '(d) 확인 뒤 paid 웹훅은 반영 안 됨');
    ok(grants(A.id) === 1, `(d) 이용권 부여 1회 (${grants(A.id)})`);
    // 동시에 확인 두 번(처음부터)
    await fresh();
    const o = await order(B);
    const k = await approve(o.json.orderId, o.json.amount);
    const two = await Promise.all([confirm(B, o.json.orderId, k.json.paymentKey, o.json.amount), confirm(B, o.json.orderId, k.json.paymentKey, o.json.amount)]);
    ok(two.every((r) => r.status === 200 && r.json.status === 'paid') && grants(B.id) === 1, `(d) 처음부터 동시에 두 번 확인 → 둘 다 paid, 이용권 부여 1회 (${grants(B.id)})`);
  }

  // (e) 결제 실패·취소 → 이용권 없음
  await fresh();
  {
    const o = await order(A);
    const k = await approve(o.json.orderId, o.json.amount, 'fail');
    const c = await confirm(A, o.json.orderId, k.json.paymentKey, o.json.amount);
    ok(c.status === 200 && c.json.status === 'failed' && (await ord(o.json.orderId))?.status === 'failed', `(e) 결제 실패 → failed (${JSON.stringify(c.json)})`);
    ok((await ent(A.id)) === null, '(e) 실패 뒤 이용권 없음');
    const after = await confirm(A, o.json.orderId, (await approve(o.json.orderId, o.json.amount)).json.paymentKey, o.json.amount);
    ok(after.status === 409 && after.json.error === 'order_state' && (await ent(A.id)) === null, '(e) 실패한 주문을 다시 확인 → 409, 이용권 없음');
    const o2 = await order(A);
    const cc = await call(handlePaymentCancel, { orderId: o2.json.orderId }, A.auth());
    ok(cc.status === 200 && cc.json.status === 'canceled' && (await ord(o2.json.orderId))?.status === 'canceled', '(e) 결제창에서 취소 → canceled');
    const late = await confirm(A, o2.json.orderId, (await approve(o2.json.orderId, o2.json.amount)).json.paymentKey, o2.json.amount);
    ok(late.status === 409 && (await ent(A.id)) === null, '(e) 취소한 주문을 확인 → 409, 이용권 없음');
    const o3 = await order(A);
    const whf = await webhook({ eventId: 'ev-fail', type: 'failed', orderId: o3.json.orderId, paymentId: null, amount: PASS_PRICE_KRW });
    ok(whf.json.applied === true && (await ord(o3.json.orderId))?.status === 'failed' && (await ent(A.id)) === null, '(e) failed 웹훅 → failed, 이용권 없음');
  }

  // (f) 환불 → 회수
  await fresh();
  {
    const p = await payOnce(A);
    const r = await refundOrder(paymentStore(), resolveProvider(), p.orderId, '시험 환불');
    ok('status' in r && r.status === 'refunded' && r.revoked === true, `(f) 환불(운영자 함수) → refunded, 이용권 회수 (${JSON.stringify(r)})`);
    ok((await ent(A.id))?.status === 'revoked' && (await ord(p.orderId))?.status === 'refunded', '(f) 이용권 revoked, 주문 refunded');
    const r2 = await refundOrder(paymentStore(), resolveProvider(), p.orderId, '시험 환불');
    ok('error' in r2 && r2.error === 'order_state', '(f) 같은 주문 다시 환불 → 처리하지 않음');
    await fresh();
    const q = await payOnce(B);
    const ev = { eventId: 'ev-refund', type: 'refunded', orderId: q.orderId, paymentId: (await ord(q.orderId))?.paymentId, amount: PASS_PRICE_KRW };
    const w1 = await webhook(ev);
    ok(w1.status === 200 && w1.json.applied === true && w1.json.revoked === true && (await ent(B.id))?.status === 'revoked', '(f) refunded 웹훅 → 회수');
  }

  // (g) 웹훅 서명 불일치 거부, 재전송 1회 반영
  await fresh();
  {
    const o = await order(A);
    const ev = { eventId: 'ev-paid-1', type: 'paid', orderId: o.json.orderId, paymentId: 'fake_pay_webhook', amount: PASS_PRICE_KRW };
    const bad = await webhook(ev, false);
    ok(bad.status === 401 && bad.json.error === 'webhook_invalid' && (await ent(A.id)) === null && (await ord(o.json.orderId))?.status === 'pending', '(g) 서명 불일치 → 401, 반영 없음');
    const tampered = JSON.stringify({ ...ev, amount: 1 });
    const t = await call(handlePaymentWebhook, tampered, undefined, { 'x-fake-signature': fakeWebhookSignature(process.env, JSON.stringify(ev)) });
    ok(t.status === 401 && (await ent(A.id)) === null, '(g) 서명 뒤 본문 변조 → 401');
    const w1 = await webhook(ev);
    ok(w1.status === 200 && w1.json.applied === true && (await ent(A.id))?.status === 'active', '(g) 올바른 paid 웹훅 → 이용권 부여');
    const w2 = await webhook(ev);
    const w3 = await webhook(ev);
    ok(w2.json.applied === false && w3.json.applied === false && grants(A.id) === 1, `(g) 같은 웹훅 재전송 2번 → 반영 안 됨, 부여 1회 (${grants(A.id)})`);
    const o2 = await order(B);
    const wm = await webhook({ eventId: 'ev-amt', type: 'paid', orderId: o2.json.orderId, paymentId: 'fake_pay_amt', amount: 100 });
    ok(wm.json.applied === false && (await ent(B.id)) === null, '(g) 금액이 다른 paid 웹훅 → 반영 안 됨');
  }

  // (h) 로그인 없는 요청 거부
  await fresh();
  {
    const o = await order(A);
    for (const [name, h, body] of [
      ['주문', handlePaymentOrder, {}],
      ['확인', handlePaymentConfirm, { orderId: o.json.orderId, paymentKey: 'x', amount: PASS_PRICE_KRW }],
      ['취소', handlePaymentCancel, { orderId: o.json.orderId }],
    ] as [string, H, unknown][]) {
      const none = await call(h, body);
      const junk = await call(h, body, 'Bearer not-a-real-token');
      ok(none.status === 401 && junk.status === 401, `(h) ${name}: 로그인 없음·틀린 토큰 → 401 (${none.status}, ${junk.status})`);
    }
    ok((await ord(o.json.orderId))?.status === 'pending', '(h) 거부된 요청은 주문을 바꾸지 않음');
  }
}

// 저장소 두 가지로
for (const m of ['memory', 'supabase']) {
  mode = m;
  await scenarios();
}
mode = '공통';

// (i) 결제 스위치 꺼짐 → 결제 API 없음
const handlers: [string, H][] = [
  ['order', handlePaymentOrder],
  ['confirm', handlePaymentConfirm],
  ['cancel', handlePaymentCancel],
  ['fake-approve', handlePaymentFakeApprove],
  ['webhook', handlePaymentWebhook],
];
for (const [label, over] of [
  ['PAYMENTS_ENABLED 없음', { PAYMENTS_ENABLED: undefined }],
  ['PAYMENTS_ENABLED=1', { PAYMENTS_ENABLED: '1' }],
  ['이용권 스위치 꺼짐', { MONETIZATION_ENABLED: undefined }],
] as [string, Record<string, string | undefined>][]) {
  setEnv(over);
  for (const [name, h] of handlers) {
    const r = await call(h, {}, A.auth());
    ok(r.status === 404 && r.json.error === 'not_found', `(i) ${label}: ${name} → 404 (${r.status})`);
  }
}

// (j) Production에서 가짜 결제사 거부
setEnv({ VERCEL_ENV: 'production' });
setPaymentStoreForTests(memoryPaymentStore());
for (const [name, h] of handlers) {
  const r = await call(h, { orderId: 'ncs_test_order', amount: PASS_PRICE_KRW, outcome: 'success', paymentKey: 'x' }, A.auth());
  ok(r.status === 500 && r.json.error === 'server_misconfigured', `(j) Production + fake: ${name} → 500 server_misconfigured (${r.status})`);
}
setEnv({ PAYMENT_PROVIDER: undefined });
ok((await order(A)).status === 500, '(j) 결제사 이름 없음 → 500');
setEnv({ PAYMENT_PROVIDER: 'unknown-pg' });
ok((await order(A)).status === 500, '(j) 모르는 결제사 → 500');
const cp = (env: Record<string, string>) =>
  spawnSync(process.execPath, ['--import', 'tsx', 'scripts/check-production.ts'], { env: { ...process.env, DIST: 'scripts', ...env }, encoding: 'utf8' }).status;
ok(cp({ VERCEL_ENV: 'production', PAYMENT_PROVIDER: 'fake' }) === 1, '(j) check-production: Production + PAYMENT_PROVIDER=fake → 빌드 실패');
ok(cp({ VERCEL_ENV: 'preview', PAYMENT_PROVIDER: 'fake' }) === 0, '(j) check-production: Preview + fake → 통과');

setPaymentStoreForTests(null);
setEnv();
for (const k of KEYS) delete process.env[k];
await mock.close();
console.log(`\n결제 시험: 통과 ${passed}, 실패 ${failed}`);
if (failed) process.exit(1);
