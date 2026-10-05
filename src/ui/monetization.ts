/**
 * 로그인(구글·카카오, Supabase PKCE)·이용권 상태·무료 1회 제한·이용권 안내.
 * VITE_MONETIZATION_ENABLED=true로 빌드했을 때만 동적으로 불러온다(diagnosis.ts, site.ts).
 *
 * 브라우저 저장소(localStorage)에 남는 것
 *  - Supabase 로그인 세션과 PKCE 코드 검증값: 키 sb-<프로젝트>-auth-token, sb-<프로젝트>-auth-token-code-verifier
 *  - 무료 진단 사용 표시: 키 ncs-free-diagnosis-used (값 "1")
 * 쿠키는 쓰지 않는다.
 *
 * 이 파일은 공개 키(VITE_SUPABASE_ANON_KEY)만 쓴다. 서비스 키는 서버(server/accounts.ts)에만 있다.
 */
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { PASS_PRICE_KRW } from '../../shared/product';
import { confirmDialog, esc } from './dom';

export type Provider = 'google' | 'kakao';
/** 로그인 방식 표시(이미 로그인한 계정의 app_metadata.provider). 카카오 스위치와 관계없이 둔다. */
const PROVIDER_LABEL: Record<string, string> = { google: '구글', kakao: '카카오' };
/**
 * 카카오 로그인 스위치(빌드 시점). "true"일 때만 카카오 버튼·문구를 넣고 로그인 시작을 허용한다.
 * 카카오는 KOE205(account_email 동의항목 설정 불가)로 보류 중이라 기본은 꺼짐.
 * 조건을 각 자리에 직접 써야 꺼진 빌드에서 번들러가 카카오 문구를 지운다.
 */
const KAKAO_LOGIN = import.meta.env.VITE_KAKAO_LOGIN_ENABLED === 'true';
const PROVIDERS_TEXT = import.meta.env.VITE_KAKAO_LOGIN_ENABLED === 'true' ? '구글 또는 카카오' : '구글';
const FREE_KEY = 'ncs-free-diagnosis-used';
const PRICE = `${PASS_PRICE_KRW.toLocaleString('ko-KR')}원`;

export interface AccountState {
  /** unconfigured: Supabase 공개 설정 값이 없음 */
  status: 'unconfigured' | 'loading' | 'guest' | 'member';
  provider: string | null;
  entitlement: 'unknown' | 'active' | 'none' | 'error';
  purchasedAt: string | null;
  loginError: string | null;
}

const state: AccountState = { status: 'loading', provider: null, entitlement: 'unknown', purchasedAt: null, loginError: null };
let client: SupabaseClient | null = null;
let userId: string | null = null;
let entitlementJob: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

export const getState = (): Readonly<AccountState> => state;
export function onChange(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/* ---------- 로그인 후 돌아온 주소 정리 ---------- */

const here = new URL(window.location.href);
/** 이용권 구매 버튼에서 로그인하러 갔다가 돌아온 경우 */
export const returnedForPurchase = here.searchParams.get('auth') === 'purchase';
const hashParams = new URLSearchParams(here.hash.slice(1));
const oauthError =
  here.searchParams.get('error_description') ?? here.searchParams.get('error') ?? hashParams.get('error_description') ?? hashParams.get('error');
if (returnedForPurchase || oauthError) {
  for (const k of ['auth', 'error', 'error_code', 'error_description']) here.searchParams.delete(k);
  if (oauthError) here.hash = '';
  // code(로그인 코드)는 남겨 두면 Supabase가 세션으로 바꾼 뒤 지운다
  window.history.replaceState(window.history.state, '', here.toString());
}

/* ---------- 초기화 ---------- */

const readyPromise = init();

async function init() {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) {
    state.status = 'unconfigured';
    emit();
    return;
  }
  const hadCode = new URL(window.location.href).searchParams.has('code');
  client = createClient(url, key, {
    auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
  });
  const { error } = await client.auth.initialize();
  if (oauthError) state.loginError = '로그인이 취소되었거나 완료되지 않았습니다.';
  else if (error && hadCode) state.loginError = '로그인을 마치지 못했습니다. 다시 시도해 주세요.';
  const { data } = await client.auth.getSession();
  applySession(data.session);
  client.auth.onAuthStateChange((event, session) => {
    // 콜백 안에서 Supabase를 바로 다시 부르지 않도록 다음 틱으로 미룬다
    window.setTimeout(() => {
      if (event === 'SIGNED_OUT') applySession(null);
      else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') applySession(session);
    }, 0);
  });
}

function applySession(session: Session | null) {
  if (!session) {
    userId = null;
    Object.assign(state, { status: 'guest', provider: null, entitlement: 'none', purchasedAt: null });
    emit();
    return;
  }
  state.status = 'member';
  state.provider = (session.user.app_metadata?.provider as string | undefined) ?? null;
  if (userId !== session.user.id) {
    userId = session.user.id;
    state.entitlement = 'unknown';
    entitlementJob = fetchEntitlement();
  }
  emit();
}

/** 내 이용권 행 읽기(RLS: 본인 행만 읽을 수 있음). 화면 표시용이며, 응답을 자를지는 서버가 따로 판단한다. */
async function fetchEntitlement() {
  if (!client || !userId) return;
  const uid = userId;
  try {
    const { data, error } = await client.from('entitlements').select('status, purchased_at').eq('user_id', uid).limit(1);
    if (uid !== userId) return;
    if (error || !Array.isArray(data)) state.entitlement = 'error';
    else {
      state.entitlement = data[0]?.status === 'active' ? 'active' : 'none';
      state.purchasedAt = (data[0]?.purchased_at as string | undefined) ?? null;
    }
  } catch {
    state.entitlement = 'error';
  }
  emit();
}

/** 로그인 상태와 이용권 확인이 끝날 때까지 기다린다 */
export async function ready(): Promise<Readonly<AccountState>> {
  await readyPromise;
  await entitlementJob;
  return state;
}

export async function recheckEntitlement() {
  if (state.status !== 'member') return;
  state.entitlement = 'unknown';
  emit();
  entitlementJob = fetchEntitlement();
  await entitlementJob;
}

export async function accessToken(): Promise<string | null> {
  await readyPromise;
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}

/** 서버가 401을 주면 한 번 갱신해 본다. 실패하면 null */
export async function refreshToken(): Promise<string | null> {
  if (!client) return null;
  try {
    const { data, error } = await client.auth.refreshSession();
    return error ? null : (data.session?.access_token ?? null);
  } catch {
    return null;
  }
}

export async function signOut() {
  if (!client) return;
  try {
    await client.auth.signOut({ scope: 'local' });
  } catch {
    // 서버에 닿지 않아도 이 브라우저의 세션은 지운다
  }
  applySession(null);
}

/* ---------- 무료 1회 표시 (기기 식별 없이 이 브라우저 저장소에만) ---------- */

export function freeUsed(): boolean {
  try {
    return window.localStorage.getItem(FREE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markFreeUsed() {
  try {
    window.localStorage.setItem(FREE_KEY, '1');
  } catch {
    // 저장소를 쓸 수 없는 브라우저에서는 제한을 걸지 않는다
  }
}

export const hasPass = () => state.status === 'member' && state.entitlement === 'active';

/* ---------- 로그인 ---------- */

/** 로그인하러 이 페이지를 떠날 때 사라지는 것이 있으면 경고 문구를 둔다(결과 화면 등) */
let leaveWarning: string | null = null;
export function setLeaveWarning(message: string | null) {
  leaveWarning = message;
}

function choiceDialog<T extends string>(title: string, message: string, buttons: { label: string; value: T; primary?: boolean }[]): Promise<T | null> {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'confirm';
    dlg.setAttribute('aria-labelledby', 'choice-title');
    dlg.innerHTML = `
      <h2 id="choice-title" class="confirm-title">${esc(title)}</h2>
      ${message ? `<p class="confirm-msg">${esc(message)}</p>` : ''}
      <div class="confirm-actions confirm-stack">
        ${buttons.map((b, i) => `<button type="button" class="${b.primary ? 'btn-primary' : 'btn-secondary'}" data-i="${i}">${esc(b.label)}</button>`).join('')}
        <button type="button" class="btn-text" data-i="-1">닫기</button>
      </div>`;
    const done = (v: T | null) => {
      dlg.close();
      dlg.remove();
      resolve(v);
    };
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      done(null);
    });
    dlg.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
      b.addEventListener('click', () => {
        const i = Number(b.dataset.i);
        done(i < 0 ? null : buttons[i].value);
      }),
    );
    document.body.appendChild(dlg);
    dlg.showModal();
    dlg.querySelector<HTMLButtonElement>('button')!.focus();
  });
}

export const notice = (title: string, message = '') => choiceDialog(title, message, []);

/** 로그인 시작. 쓸 수 없는 방식(카카오 스위치 꺼짐 등)은 거부하고 false를 돌려준다. */
export async function startSignIn(provider: Provider, returnPath: string): Promise<boolean> {
  if (provider !== 'google' && !(provider === 'kakao' && KAKAO_LOGIN)) return false;
  await readyPromise;
  if (!client) return false;
  const { error } = await client.auth.signInWithOAuth({
    provider,
    options: { redirectTo: new URL(returnPath, window.location.origin).toString() },
  });
  if (error) await notice('로그인 화면을 열지 못했습니다', '잠시 뒤 다시 시도해 주세요.');
  return !error;
}

/**
 * 로그인 방식을 고르게 한 뒤 로그인 화면으로 보낸다.
 * returnPath: 로그인 뒤 돌아올 경로(같은 사이트 안). Supabase 대시보드의 Redirect URLs에 등록돼 있어야 한다.
 */
export async function chooseAndSignIn(returnPath: string, reason = '') {
  await readyPromise;
  if (!client) return notice('로그인을 쓸 수 없습니다', '로그인 기능이 아직 설정되지 않았습니다.');
  const msg = [reason, leaveWarning].filter(Boolean).join(' ');
  const provider = await choiceDialog<Provider>('로그인', msg, [
    { label: '구글로 로그인', value: 'google', primary: true },
    ...(import.meta.env.VITE_KAKAO_LOGIN_ENABLED === 'true' ? [{ label: '카카오로 로그인', value: 'kakao' as const, primary: true }] : []),
  ]);
  if (!provider) return;
  await startSignIn(provider, returnPath);
}

/* ---------- 이용권 ---------- */

export const PASS_BENEFITS = [
  '새 문제로 무제한 진단',
  '12문항 전체 해설',
  '영역별 상세 리포트(취약 유형과 틀린 패턴)',
  '상세까지 담긴 인쇄 / PDF 저장',
  '한 번 결제로 추가 결제 없이 계속 이용(구독 아님)',
];

/** 이용권 혜택 카드 */
export function passCardHtml(headingTag: 'h2' | 'h3' = 'h3', title = '이용권으로 전체 리포트 보기') {
  return `
  <div class="pass-card">
    <${headingTag} class="pass-title">${esc(title)}</${headingTag}>
    <ul class="pass-benefits">${PASS_BENEFITS.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
    <p class="pass-price"><b>${PRICE}</b><span class="pass-status">결제 준비 중</span></p>
    <button type="button" class="btn-primary" data-pass-buy>이용권 구매</button>
  </div>`;
}

/**
 * 이용권 구매 버튼. 이번 단계는 로그인까지만 처리하고, 로그인한 뒤에는 "결제 준비 중"을 알린다.
 * 로그인하러 갈 때는 진단 페이지의 구매 화면(?auth=purchase)으로 돌아오게 한다.
 */
export async function purchase() {
  await ready();
  if (state.status === 'unconfigured') return notice('이용권 구매', '이용권 기능을 준비하고 있습니다.');
  if (state.status !== 'member') return chooseAndSignIn('/diagnosis/?auth=purchase', `이용권 구매에는 ${PROVIDERS_TEXT} 로그인이 필요합니다.`);
  if (state.entitlement === 'active') return notice('이미 이용권이 있습니다', '새 문제로 진단, 전 문항 해설, 영역별 상세를 이용할 수 있습니다.');
  return notice('결제는 준비 중입니다', `${PROVIDER_LABEL[state.provider ?? ''] ?? ''} 계정으로 로그인되어 있습니다. ${PRICE} 이용권 결제가 열리면 이 계정으로 구매할 수 있습니다.`.trim());
}

/** 결과 화면의 잠긴 자리([data-locked])에 이용권 안내를 채운다 */
export function fillLocked(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('[data-locked]').forEach((el) => {
    el.insertAdjacentHTML('beforeend', el.dataset.locked === 'details' ? passCardHtml('h3') : '<button type="button" class="btn-secondary" data-pass-buy>이용권 구매</button>');
  });
  root.querySelectorAll<HTMLButtonElement>('[data-pass-buy]').forEach((b) => b.addEventListener('click', () => void purchase()));
}

/* ---------- 이용권 안내 화면 (무료 1회 소진, 구매 버튼으로 로그인 후 돌아옴) ---------- */

export function renderPaywall(app: HTMLElement, mode: 'free-used' | 'purchase', actions: { start: () => void; home: () => void }) {
  let first = true;
  const draw = () => {
    // 다른 화면으로 바뀌었으면 더 그리지 않는다(새 화면을 덮어쓰지 않게)
    if (!first && !app.querySelector('[data-paywall]')) return stop();
    first = false;
    const s = state;
    let status = '';
    let primary = '';
    if (s.loginError) status = s.loginError;
    else if (s.status === 'loading' || (s.status === 'member' && s.entitlement === 'unknown')) status = '로그인 상태를 확인하고 있습니다…';
    else if (s.status === 'unconfigured') status = '이용권 기능을 준비하고 있습니다.';
    else if (s.status === 'guest') status = `이용권을 구매하려면 ${PROVIDERS_TEXT}로 로그인하세요.`;
    else if (s.entitlement === 'active') {
      status = '이용권이 확인되었습니다.';
      primary = '<button type="button" class="btn-primary" data-act="start">새 문제로 진단</button>';
    } else if (s.entitlement === 'error') {
      status = '이용권 상태를 확인하지 못했습니다.';
      primary = '<button type="button" class="btn-primary" data-act="recheck">다시 시도</button>';
    } else status = `${PROVIDER_LABEL[s.provider ?? ''] ?? ''} 계정으로 로그인되어 있습니다. 결제는 준비 중입니다.`.trim();

    const showCard = !(s.status === 'member' && s.entitlement === 'active');
    app.innerHTML = `
    <main class="page" id="main" data-paywall>
      <p class="eyebrow">NCS 수리능력 진단</p>
      <h1 class="title" tabindex="-1">${mode === 'free-used' ? '무료 진단을 이미 사용했습니다' : '이용권 구매'}</h1>
      ${mode === 'free-used' ? '<p class="lead">무료 진단은 한 번 이용할 수 있습니다. 새 문제로 다시 진단하려면 이용권이 필요합니다.</p>' : ''}
      <p class="notice" role="status">${esc(status)}</p>
      ${showCard ? passCardHtml('h2') : ''}
      <div class="actions">
        ${primary}
        <a class="btn-secondary" href="/">홈으로</a>
      </div>
    </main>`;
    app.querySelector<HTMLButtonElement>('[data-act="start"]')?.addEventListener('click', () => {
      stop();
      actions.start();
    });
    app.querySelector<HTMLButtonElement>('[data-act="recheck"]')?.addEventListener('click', () => void recheckEntitlement());
    app.querySelectorAll<HTMLButtonElement>('[data-pass-buy]').forEach((b) => b.addEventListener('click', () => void purchase()));
  };
  const off = onChange(draw);
  const stop = () => {
    off();
  };
  setLeaveWarning(null);
  draw();
  (app.querySelector('.title') as HTMLElement | null)?.focus({ preventScroll: true });
  return stop;
}

/* ---------- 머리말 계정 메뉴 ---------- */

function formatDate(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ko-KR', { dateStyle: 'medium' });
}

async function accountMenu() {
  const s = state;
  const pass = s.entitlement === 'active' ? `있음${s.purchasedAt ? ` (${formatDate(s.purchasedAt)} 구매)` : ''}` : s.entitlement === 'error' ? '확인하지 못함' : '없음';
  const choice = await choiceDialog<'logout' | 'delete' | 'buy'>(
    '내 계정',
    `로그인 방식: ${PROVIDER_LABEL[s.provider ?? ''] ?? '알 수 없음'} · 이용권: ${pass}`,
    [
      ...(s.entitlement === 'active' ? [] : [{ label: '이용권 구매', value: 'buy' as const, primary: true }]),
      { label: '로그아웃', value: 'logout' },
      { label: '계정 삭제', value: 'delete' },
    ],
  );
  if (choice === 'buy') await purchase();
  if (choice === 'logout') await signOut();
  if (choice === 'delete') await deleteAccountFlow();
}

async function deleteAccountFlow() {
  const ok = await confirmDialog(
    '계정을 삭제하면 로그인 정보와 이용권 정보가 바로 삭제되며 되돌릴 수 없습니다. 구매한 이용권도 함께 사라집니다. 삭제할까요?',
    '계정 삭제',
  );
  if (!ok) return;
  const token = await accessToken();
  if (!token) return notice('계정을 삭제하지 못했습니다', '로그인이 만료되었습니다. 다시 로그인한 뒤 시도해 주세요.');
  try {
    const res = await fetch('/api/account-delete', { method: 'POST', headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { message?: string } | null;
      return notice('계정을 삭제하지 못했습니다', j?.message ?? `서버 응답 오류 (${res.status})`);
    }
  } catch {
    return notice('계정을 삭제하지 못했습니다', '서버에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
  }
  await signOut();
  await notice('계정을 삭제했습니다', '로그인 정보와 이용권 정보가 삭제되었습니다.');
}

/** 머리말의 #account-slot에 로그인 버튼 또는 계정 메뉴를 그린다 */
export function mountHeader() {
  const slot = document.getElementById('account-slot');
  if (!slot) return;
  const draw = () => {
    const s = state;
    if (s.status === 'unconfigured') {
      slot.hidden = true;
      return;
    }
    slot.hidden = false;
    if (s.status === 'member') {
      slot.innerHTML = `<button type="button" class="account-btn" aria-haspopup="dialog">내 계정${hasPass() ? '<span class="account-badge">이용권</span>' : ''}</button>`;
      slot.querySelector('button')!.addEventListener('click', () => void accountMenu());
    } else {
      slot.innerHTML = `<button type="button" class="account-btn" aria-haspopup="dialog" ${s.status === 'loading' ? 'disabled' : ''}>로그인</button>`;
      slot.querySelector('button')!.addEventListener('click', () => void chooseAndSignIn(window.location.pathname));
    }
  };
  onChange(draw);
  draw();
  // 로그인 실패로 돌아온 경우 알려 준다(진단 페이지의 구매 화면은 화면 안에서 따로 알림)
  void readyPromise.then(() => {
    if (state.loginError && !returnedForPurchase) void notice('로그인하지 못했습니다', state.loginError);
  });
}
