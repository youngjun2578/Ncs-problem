/**
 * 실제 Supabase에서 결제 저장소 동작을 확인한다(사람이 직접, 필요할 때만 실행).
 *
 *   LIVE_CHECK_CONFIRM=yes npm run live:supabase-check
 *
 * ⚠️ 프리뷰와 운영이 같은 Supabase 프로젝트를 쓴다. 이 스크립트는 운영 DB에 시험 계정·주문을 잠깐 만들었다가 지운다.
 *    절차와 주의 사항: docs/supabase-payment-live-test.md
 *
 * 지키는 것
 *  - LIVE_CHECK_CONFIRM=yes(명령줄 환경 변수)가 없으면 아무것도 읽지 않고 끝낸다.
 *  - 접속 값은 저장소 맨 위의 .env.local에서만 읽는다(.gitignore에 들어 있는지 먼저 확인). 셸 환경 변수의 접속 값은 쓰지 않는다.
 *  - 키 값·주소는 로그에 쓰지 않는다(설정 여부만). 오류 메시지에서도 키 값을 가린다.
 *  - 시험용 접두사(ncs-live-check-, ncs_livecheck_)가 붙은, 이 실행에서 만든 계정·주문만 다룬다.
 *    모든 조회·변경은 이 실행에서 만든 계정 ID·주문번호로 거른다. 기존 데이터는 읽지도 쓰지도 않는다.
 *  - 끝에(실패해도, Ctrl+C로 멈춰도) 만든 주문·이용권·계정을 지운다.
 *
 * 확인하는 것(서버 코드 server/payments/store.ts의 supabasePaymentStore를 그대로 쓴다)
 *  1) 조건부 갱신(update ... where status in (...)): 처음 한 번만 바뀜
 *  2) 이용권 upsert("이미 있으면 무시"): 두 번째 부여는 무시, 회수된 행은 다시 부여
 *  3) 계정당 pending 주문 1개(20261008000000 마이그레이션): 두 번째 pending 거부, 서비스는 이어 쓰기
 *  4) 동시 부여: 같은 계정에 서로 다른 주문으로 동시에 부여해도 이용권 1회
 *  5) provider_payment_id 재사용 거부
 *  6) 계정 삭제 시 주문·이용권 cascade
 *  7) (공개 키가 있으면) anon 키로 payment_orders·entitlements 읽기·쓰기가 막히는지
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { ConflictError, supabasePaymentStore } from '../server/payments/store.js';
import { createOrder } from '../server/payments/service.js';
import { fakeProvider } from '../server/payments/fake.js';
import { PASS_PRICE_KRW } from '../shared/product.js';

if (process.env.LIVE_CHECK_CONFIRM !== 'yes') {
  console.log('LIVE_CHECK_CONFIRM=yes가 없어 아무것도 하지 않고 끝냅니다. 실행 전 docs/supabase-payment-live-test.md를 읽으세요.');
  process.exit(0);
}

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ENV_FILE = `${ROOT}.env.local`;

// .env.local이 커밋되지 않는 파일인지 먼저 확인
if (spawnSync('git', ['check-ignore', '-q', '.env.local'], { cwd: ROOT }).status !== 0) {
  console.log('중단: .env.local이 .gitignore에 들어 있지 않습니다. 키가 커밋될 수 있어 실행하지 않습니다.');
  process.exit(1);
}

function readEnvLocal(): Record<string, string> {
  let text: string;
  try {
    text = readFileSync(ENV_FILE, 'utf8');
  } catch {
    console.log('중단: .env.local 파일이 없습니다.');
    process.exit(1);
  }
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trimStart().startsWith('#')) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

const local = readEnvLocal();
const URL_ = local.SUPABASE_URL || local.VITE_SUPABASE_URL || '';
const SERVICE = local.SUPABASE_SERVICE_ROLE_KEY || '';
const ANON = local.VITE_SUPABASE_ANON_KEY || '';
console.log(`접속 값(.env.local): 주소 ${URL_ ? '있음' : '없음'}, 서비스 키 ${SERVICE ? '있음' : '없음'}, 공개 키 ${ANON ? '있음' : '없음(7번 건너뜀)'}`);
if (!URL_ || !SERVICE) {
  console.log('중단: .env.local에 SUPABASE_URL(또는 VITE_SUPABASE_URL)과 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.');
  process.exit(1);
}

/** 로그에 키·주소가 섞이지 않게 가린다 */
const redact = (s: string) => [SERVICE, ANON, URL_].filter((v) => v.length >= 8).reduce((t, v) => t.split(v).join('<가림>'), s);
const say = (s: string) => console.log(redact(s));
const errText = (e: unknown) => redact(e instanceof Error ? `${e.constructor.name}: ${e.message}` : JSON.stringify(e));

const RUN = `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
const EMAIL = (n: string) => `ncs-live-check-${RUN}-${n}@example.com`;
const OID = (n: string) => `ncs_livecheck_${RUN}_${n}`;

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const store = supabasePaymentStore({ SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: SERVICE });
// 가짜 결제사의 prepare만 쓴다(서명 값이 필요 없는 경로). 서명용 비밀 값은 시험용 임시 값
const provider = fakeProvider({ REPORT_TOKEN_SECRET: `live-check-${randomBytes(16).toString('hex')}` });

const users: string[] = [];
let passed = 0;
let failed = 0;
const ok = (c: unknown, m: string) => {
  if (c) passed++;
  else failed++;
  say(`${c ? '통과' : '실패'}  ${m}`);
};

async function newUser(n: string): Promise<string> {
  const r = await admin.auth.admin.createUser({ email: EMAIL(n), email_confirm: true, user_metadata: { ncs_live_check: RUN } });
  if (r.error || !r.data.user) throw new Error(`시험 계정을 만들지 못했습니다: ${r.error?.message ?? '알 수 없음'}`);
  users.push(r.data.user.id);
  return r.data.user.id;
}
/** 이 실행에서 만든 계정의 행만 센다 */
async function count(table: 'payment_orders' | 'entitlements', userId: string, extra: Record<string, string> = {}) {
  let q = admin.from(table).select('user_id', { count: 'exact', head: true }).eq('user_id', userId);
  for (const [k, v] of Object.entries(extra)) q = q.eq(k, v);
  const r = await q;
  if (r.error) throw new Error(`${table} 조회 실패: ${r.error.message}`);
  return r.count ?? 0;
}
const throwsConflict = (p: Promise<unknown>) => p.then(() => false, (e) => e instanceof ConflictError);

let cleaned = false;
async function cleanup() {
  if (cleaned) return;
  cleaned = true;
  for (const id of users) {
    // 계정 삭제 cascade에 기대지 않고 먼저 직접 지운다(이 실행의 계정 ID로만 거름)
    const a = await admin.from('payment_orders').delete().eq('user_id', id).like('order_id', 'ncs_livecheck_%');
    const b = await admin.from('entitlements').delete().eq('user_id', id);
    const c = await admin.auth.admin.deleteUser(id);
    const errs = [a.error, b.error, c.error].filter(Boolean).map((e) => e!.message);
    say(errs.length ? `정리 일부 실패(계정 ${users.indexOf(id) + 1}): ${errs.join(' / ')} — 문서의 "시험 데이터 지우기"로 지우세요.` : `정리 완료(계정 ${users.indexOf(id) + 1})`);
  }
}
for (const sig of ['SIGINT', 'SIGTERM'] as const)
  process.on(sig, () => {
    say('중단 요청: 시험 데이터를 정리합니다…');
    cleanup().finally(() => process.exit(130));
  });

try {
  say(`실행 표시: ${RUN} (시험 계정 메일 ncs-live-check-${RUN}-*, 주문번호 ncs_livecheck_${RUN}_*)`);
  const A = await newUser('a');
  const B = await newUser('b');

  // 1) 조건부 갱신
  await store.createOrder({ orderId: OID('t1'), userId: A, amount: PASS_PRICE_KRW, provider: 'fake' });
  const first = await store.transition(OID('t1'), ['pending'], 'paid', { paymentId: `fake_pay_livecheck_${RUN}_1` });
  const second = await store.transition(OID('t1'), ['pending'], 'paid', { paymentId: `fake_pay_livecheck_${RUN}_1b` });
  ok(first?.status === 'paid' && second === null, '1) 조건부 갱신: pending → paid는 처음 한 번만');
  ok((await store.getOrder(OID('t1')))?.paymentId === `fake_pay_livecheck_${RUN}_1`, '1) 두 번째 갱신은 거래 식별자를 바꾸지 않음');

  // 2) 이용권 "이미 있으면 무시"
  const g1 = await store.grantEntitlement(A, OID('t1'));
  const g2 = await store.grantEntitlement(A, OID('t1x'));
  const e = await store.getEntitlement(A);
  ok(g1 === true && g2 === false && e?.status === 'active' && e.orderId === OID('t1'), '2) 이용권 부여: 첫 번째만 반영, 두 번째는 무시(주문번호 그대로)');
  ok(await store.revokeEntitlement(A, OID('t1')), '2) 회수(조건부 갱신)');
  const g3 = await store.grantEntitlement(A, OID('t1r'));
  ok(g3 === true && (await store.getEntitlement(A))?.orderId === OID('t1r'), '2) 회수된 행은 새 주문으로 다시 부여');

  // 3) 계정당 pending 1개
  await store.createOrder({ orderId: OID('p1'), userId: B, amount: PASS_PRICE_KRW, provider: 'fake' });
  ok(await throwsConflict(store.createOrder({ orderId: OID('p2'), userId: B, amount: PASS_PRICE_KRW, provider: 'fake' })), '3) 같은 계정 두 번째 pending → 유니크 위반(23505). 실패하면 20261008000000 마이그레이션이 실행되지 않은 것');
  ok((await count('payment_orders', B, { status: 'pending' })) === 1, '3) B의 pending 주문 1개');
  const resumed = await createOrder(store, provider, B);
  ok('orderId' in resumed && resumed.orderId === OID('p1') && resumed.resumed === true, '3) 서비스 주문 만들기: 기존 pending을 이어 씀');

  // 4) 동시 부여: 서로 다른 주문 다섯 개로 동시에 부여해도 1회
  await store.transition(OID('p1'), ['pending'], 'paid', { paymentId: `fake_pay_livecheck_${RUN}_4` });
  const results = await Promise.all([1, 2, 3, 4, 5].map((i) => store.grantEntitlement(B, OID(`c${i}`))));
  ok(results.filter(Boolean).length === 1 && (await count('entitlements', B)) === 1, `4) 동시 부여 5번 → 부여 1회, 이용권 1행 (${results.filter(Boolean).length})`);

  // 5) 거래 식별자 재사용 거부
  await store.createOrder({ orderId: OID('d1'), userId: B, amount: PASS_PRICE_KRW, provider: 'fake' });
  ok(await throwsConflict(store.transition(OID('d1'), ['pending'], 'paid', { paymentId: `fake_pay_livecheck_${RUN}_4` })), '5) 다른 주문의 provider_payment_id 재사용 → 유니크 위반');
  ok((await store.getOrder(OID('d1')))?.status === 'pending', '5) 거부된 갱신은 아무것도 바꾸지 않음');

  // 7) anon 키 차단(공개 키가 있을 때만)
  if (ANON) {
    const anon = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const ro = await anon.from('payment_orders').select('order_id').eq('user_id', B);
    const re = await anon.from('entitlements').select('user_id').eq('user_id', B);
    ok((ro.error || (ro.data ?? []).length === 0) && (re.error || (re.data ?? []).length === 0), '7) anon: 주문·이용권 읽기 막힘(오류 또는 0행)');
    const wo = await anon.from('payment_orders').insert({ order_id: OID('anon'), user_id: B, amount: 1, status: 'paid', provider: 'fake' });
    const we = await anon.from('entitlements').update({ status: 'active' }).eq('user_id', B).select('user_id');
    ok(!!wo.error && (!!we.error || (we.data ?? []).length === 0), '7) anon: 주문 넣기·이용권 바꾸기 막힘');
  }

  // 6) 계정 삭제 cascade (마지막에: A를 지운다)
  await store.createOrder({ orderId: OID('del'), userId: A, amount: PASS_PRICE_KRW, provider: 'fake' });
  const del = await admin.auth.admin.deleteUser(A);
  ok(!del.error, '6) 시험 계정 A 삭제');
  ok((await count('payment_orders', A)) === 0 && (await count('entitlements', A)) === 0, '6) 계정 삭제 뒤 A의 주문·이용권 0행(cascade)');
  if (!del.error) users.splice(users.indexOf(A), 1);
} catch (e) {
  failed++;
  say(`오류: ${errText(e)}`);
} finally {
  await cleanup();
}
say(`\n실제 Supabase 확인: 통과 ${passed}, 실패 ${failed}`);
process.exit(failed ? 1 : 0);
