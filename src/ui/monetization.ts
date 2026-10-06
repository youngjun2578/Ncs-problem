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
import { esc } from './dom';
import '../styles/account.css';

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

const CLOSE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

/** Google "G" 로고(표준 4색). 색과 모양을 바꾸지 않는다. */
const GOOGLE_LOGO =
  '<svg class="gsi-logo" viewBox="0 0 48 48" aria-hidden="true" focusable="false">' +
  '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>' +
  '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>' +
  '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>' +
  '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>' +
  '</svg>';

let modalSeq = 0;

/**
 * 공통 모달(<dialog>): aria-modal, 제목·설명 연결, Tab이 창 안에서만 돌기, Esc로 닫기, 닫으면 연 자리로 포커스 되돌리기.
 * body: 제목 아래 내용 HTML. 닫기(X) 버튼은 closable일 때만.
 */
function openModal(opts: { title: string; body: string; className?: string; closable?: boolean; describedBy?: string }) {
  const id = `m${++modalSeq}`;
  const opener = document.activeElement as HTMLElement | null;
  const dlg = document.createElement('dialog');
  dlg.className = `auth-modal ${opts.className ?? ''}`.trim();
  dlg.setAttribute('aria-modal', 'true');
  dlg.setAttribute('aria-labelledby', `${id}-title`);
  if (opts.describedBy) dlg.setAttribute('aria-describedby', `${id}-${opts.describedBy}`);
  dlg.innerHTML = `
    ${opts.closable === false ? '' : `<button type="button" class="auth-close" data-close aria-label="닫기">${CLOSE_ICON}</button>`}
    <h2 id="${id}-title" class="auth-title">${esc(opts.title)}</h2>
    ${opts.body.replace(/id="@/g, `id="${id}-`)}`;
  let onClose: () => void = () => {};
  const close = () => {
    if (!dlg.open) return;
    dlg.close();
    dlg.remove();
    onClose();
    if (opener?.isConnected) opener.focus();
  };
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  dlg.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const items = [...dlg.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || !dlg.contains(document.activeElement))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
  dlg.querySelector('[data-close]')?.addEventListener('click', close);
  document.body.appendChild(dlg);
  dlg.showModal();
  return { dlg, close, onClose: (f: () => void) => (onClose = f) };
}

/** 알림·선택 창. 고른 값(닫으면 null)을 돌려준다. */
function choiceDialog<T extends string>(title: string, message: string, buttons: { label: string; value: T; primary?: boolean }[]): Promise<T | null> {
  return new Promise((resolve) => {
    let picked: T | null = null;
    const m = openModal({
      title,
      describedBy: message ? 'msg' : undefined,
      body: `
      ${message ? `<p id="@msg" class="auth-lead">${esc(message)}</p>` : ''}
      <div class="acct-actions">
        ${buttons.map((b, i) => `<button type="button" class="${b.primary ? 'btn-primary' : 'btn-secondary'}" data-i="${i}">${esc(b.label)}</button>`).join('')}
        ${buttons.length ? '' : '<button type="button" class="btn-secondary" data-close-btn>확인</button>'}
      </div>`,
    });
    m.onClose(() => resolve(picked));
    m.dlg.querySelectorAll<HTMLButtonElement>('[data-i]').forEach((b) =>
      b.addEventListener('click', () => {
        picked = buttons[Number(b.dataset.i)].value;
        m.close();
      }),
    );
    m.dlg.querySelector('[data-close-btn]')?.addEventListener('click', () => m.close());
    m.dlg.querySelector<HTMLButtonElement>('.acct-actions button')?.focus();
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
 * 로그인 창을 열고, 고른 방식의 로그인 화면으로 보낸다.
 * returnPath: 로그인 뒤 돌아올 경로(같은 사이트 안). Supabase 대시보드의 Redirect URLs에 등록돼 있어야 한다.
 * purpose: 'purchase'면 이용권 구매 버튼에서 연 것(안내 문구가 다르다).
 */
export async function chooseAndSignIn(returnPath: string, purpose: 'login' | 'purchase' = 'login') {
  await readyPromise;
  if (!client) return notice('로그인을 쓸 수 없습니다', '로그인 기능이 아직 설정되지 않았습니다.');
  const lead = purpose === 'purchase' ? '이용권을 구매하려면 먼저 로그인해 주세요.' : '로그인은 이용권 구매와 이용에만 필요합니다.';
  const m = openModal({
    title: '로그인',
    describedBy: 'lead',
    body: `
    <p id="@lead" class="auth-lead">${esc(lead)}</p>
    ${leaveWarning ? `<p class="auth-warn">${esc(leaveWarning)}</p>` : ''}
    <div class="auth-providers">
      <button type="button" class="gsi-btn" data-provider="google">${GOOGLE_LOGO}<span>Google로 계속하기</span></button>
      ${import.meta.env.VITE_KAKAO_LOGIN_ENABLED === 'true' ? '<button type="button" class="btn-secondary auth-provider-alt" data-provider="kakao">카카오로 계속하기</button>' : ''}
    </div>
    <p class="auth-fine">이 사이트의 데이터베이스에는 계정 ID와 이용권 상태만 저장하며, 답안·진단 결과·이름·프로필 사진은 저장하지 않습니다. 로그인은 인증 서비스(Supabase Auth)가 처리하며, 인증 서비스는 로그인할 때 받은 계정 정보를 보관할 수 있습니다. <a href="/privacy/">개인정보 안내</a></p>`,
  });
  m.dlg.querySelectorAll<HTMLButtonElement>('[data-provider]').forEach((b) =>
    b.addEventListener('click', async () => {
      m.dlg.querySelectorAll<HTMLButtonElement>('[data-provider]').forEach((x) => (x.disabled = true));
      const ok = await startSignIn(b.dataset.provider as Provider, returnPath);
      if (!ok) m.close();
    }),
  );
  m.dlg.querySelector<HTMLButtonElement>('.gsi-btn')!.focus();
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
  if (state.status !== 'member') return chooseAndSignIn('/diagnosis/?auth=purchase', 'purchase');
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

/** 내 계정 창: 로그인 방식, 이용권 상태, 이용권 구매(없을 때만), 로그아웃, 계정 삭제 */
function accountMenu() {
  const s = state;
  let pass: string;
  if (s.entitlement === 'active') {
    const date = formatDate(s.purchasedAt);
    pass = `<span class="pass-pill is-on">있음</span>${date ? `<span class="acct-sub">${esc(date)} 구매</span>` : ''}`;
  } else if (s.entitlement === 'none') {
    pass = '<span class="pass-pill is-off">없음</span><span class="acct-sub">이용권이 있으면 영역별 상세와 3번 이후 해설까지 볼 수 있습니다.</span>';
  } else if (s.entitlement === 'error') {
    pass = '확인하지 못함<span class="acct-sub">잠시 뒤 다시 열어 확인해 주세요.</span>';
  } else pass = '확인하고 있습니다…';
  const m = openModal({
    title: '내 계정',
    body: `
    <dl class="acct-info">
      <div class="acct-row"><dt>로그인 방식</dt><dd>${esc(PROVIDER_LABEL[s.provider ?? ''] ?? '알 수 없음')}</dd></div>
      <div class="acct-row"><dt>이용권</dt><dd>${pass}</dd></div>
    </dl>
    <div class="acct-actions">
      ${s.entitlement === 'none' ? '<button type="button" class="btn-primary" data-act="buy">이용권 구매</button>' : ''}
      <button type="button" class="btn-secondary" data-act="logout">로그아웃</button>
    </div>
    <div class="acct-danger-zone">
      <button type="button" class="btn-danger-text" data-act="delete">계정 삭제</button>
    </div>`,
  });
  const on = (act: string, run: () => Promise<unknown> | void) =>
    m.dlg.querySelector(`[data-act="${act}"]`)?.addEventListener('click', () => {
      m.close();
      void run();
    });
  on('buy', purchase);
  on('logout', signOut);
  on('delete', deleteAccountFlow);
  m.dlg.querySelector<HTMLButtonElement>('.acct-actions button')!.focus();
}

/** 계정 삭제 확인. 삭제하면 true */
function confirmDelete(): Promise<boolean> {
  return new Promise((resolve) => {
    let yes = false;
    const m = openModal({
      title: '계정을 삭제할까요?',
      describedBy: 'msg',
      body: `
      <p id="@msg" class="auth-lead">계정과 이용권 정보가 삭제되며 되돌릴 수 없습니다. 구매한 이용권도 함께 사라집니다.</p>
      <div class="auth-confirm-actions">
        <button type="button" class="btn-secondary" data-no>취소</button>
        <button type="button" class="btn-danger" data-yes>계정 삭제</button>
      </div>`,
    });
    m.onClose(() => resolve(yes));
    m.dlg.querySelector('[data-no]')!.addEventListener('click', () => m.close());
    m.dlg.querySelector('[data-yes]')!.addEventListener('click', () => {
      yes = true;
      m.close();
    });
    // 실수로 지우지 않게 처음 포커스는 취소에
    m.dlg.querySelector<HTMLButtonElement>('[data-no]')!.focus();
  });
}

async function deleteAccountFlow() {
  if (!(await confirmDelete())) return;
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
      slot.querySelector('button')!.addEventListener('click', accountMenu);
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
