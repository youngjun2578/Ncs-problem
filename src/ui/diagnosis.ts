import '../styles/main.css';
import type { ReportResponse } from '../../shared/api';
import { ApiFailure, requestReport, startSession } from './api';
import { esc } from './dom';
import { runTest } from './test';
import { renderResult } from './result';

/*
 * 진단 흐름: 세션 요청(문제만 받음) → 풀이 → 채점 요청 → 결과.
 * 문제 생성·채점·리포트 계산은 모두 서버(api/)에서 한다.
 */

const app = document.getElementById('app')!;

/** 풀이 중에는 머리말·꼬리말을 숨겨 문제에만 집중하게 한다 */
const setTesting = (on: boolean) => document.body.classList.toggle('testing', on);

/**
 * 화면 세대 번호. 새 세션을 요청할 때마다 늘린다.
 * 늦게 도착한 이전 요청의 응답이 새 화면을 덮어쓰지 않게 한다.
 */
let generation = 0;

function showStatus(title: string) {
  app.innerHTML = `
  <main class="page" id="main">
    <p class="muted" role="status">${esc(title)}</p>
  </main>`;
}

function showError(title: string, message: string, actions: { label: string; primary?: boolean; run: () => void }[]) {
  app.innerHTML = `
  <main class="page" id="main">
    <h1 class="title" tabindex="-1">${esc(title)}</h1>
    <p class="notice" role="alert">${esc(message)}</p>
    <div class="actions">
      ${actions.map((a, i) => `<button type="button" class="${a.primary ? 'btn-primary' : 'btn-secondary'}" data-i="${i}">${esc(a.label)}</button>`).join('')}
    </div>
  </main>`;
  app.querySelectorAll<HTMLButtonElement>('.actions button').forEach((b) => b.addEventListener('click', () => actions[Number(b.dataset.i)].run()));
  (app.querySelector('.title') as HTMLElement).focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

const goHome = () => {
  window.location.href = '/';
};

/*
 * 이용권 기능(스위치가 켜진 빌드에서만). 꺼진 빌드에서는 mon이 null이고 아래 분기는 모두 건너뛴다.
 */
type Mon = typeof import('./monetization');
// 클라이언트 기능 스위치(VITE_MONETIZATION_ENABLED): 로그인 버튼·이용권 안내·무료 1회 제한 화면만 정한다.
// 조건을 import 자리에 직접 써야 꺼진 빌드에서 번들러가 이 import와 @supabase/supabase-js를 통째로 지운다.
const mon: Promise<Mon> | null = import.meta.env.VITE_MONETIZATION_ENABLED === 'true' ? import('./monetization') : null;
if (mon) void mon.then((m) => m.mountHeader());

/*
 * 심화 진단 화면(스위치가 켜진 빌드에서만). 꺼진 빌드에서는 adv가 null이고 아래 분기는 모두 건너뛴다.
 * 이용권 기능과 같은 방식으로, 조건을 import 자리에 직접 써서 꺼진 빌드에서 advanced 모듈을 통째로 지운다.
 */
type Adv = typeof import('./advanced');
const adv: Promise<Adv> | null = import.meta.env.VITE_ADVANCED_LEVEL_ENABLED === 'true' ? import('./advanced') : null;

const RESULT_LEAVE_WARNING = '로그인 화면으로 이동하면 지금 보고 있는 결과는 사라집니다. 필요하면 먼저 인쇄 / PDF로 저장하세요.';
const ANSWERS_LEAVE_WARNING = '로그인 화면으로 이동하면 지금 푼 답은 사라집니다.';

/**
 * 진단을 시작해도 되는지(무료 1회 제한). 막히면 이용권 안내 화면을 그리고 false.
 * 무료 진단을 아직 안 썼으면 로그인 확인을 기다리지 않고 바로 시작한다.
 */
async function mayStart(my: number): Promise<boolean> {
  if (!mon) return true;
  const m = await mon;
  if (!m.freeUsed()) return true;
  showStatus('이용권을 확인하고 있습니다…');
  await m.ready();
  if (my !== generation) return false;
  if (m.hasPass()) return true;
  m.renderPaywall(app, 'free-used', { start, home: goHome });
  return false;
}

async function start() {
  const my = ++generation;
  setTesting(false);
  if (!(await mayStart(my)) || my !== generation) return;
  showStatus('문제를 준비하고 있습니다…');
  let session;
  try {
    session = await (adv ? (await adv).requestSession() : startSession());
  } catch (e) {
    if (my !== generation) return;
    if (adv && e instanceof ApiFailure && e.code === 'level_unavailable') {
      (await adv).renderUnavailable(app, { basic: start, home: goHome });
      return;
    }
    showError('문제를 불러오지 못했습니다', e instanceof ApiFailure ? e.message : '알 수 없는 오류가 났습니다.', [
      { label: '다시 시도', primary: true, run: start },
      { label: '홈으로', run: goHome },
    ]);
    return;
  }
  if (my !== generation) return;
  setTesting(true);
  if (mon) void mon.then((m) => m.setLeaveWarning(ANSWERS_LEAVE_WARNING));
  runTest(app, session.questions, (answers, secs) => submit(my, session.token, answers, secs), {
    home: goHome,
    // 같은 세트를 다시 쓰지 않고 서버에 새 세션을 요청한다
    restart: start,
  });
}

/** 채점 요청. 실패해도 답과 시간은 그대로 두고 다시 보낼 수 있다. */
async function submit(my: number, token: string, answers: number[], secs: number[], opts: { asGuest?: boolean; retried?: boolean } = {}) {
  if (my !== generation) return;
  setTesting(false);
  showStatus('채점하고 있습니다…');
  const m = mon ? await mon : null;
  m?.setLeaveWarning(ANSWERS_LEAVE_WARNING);
  let res: ReportResponse;
  try {
    // 로그인했으면 로그인 토큰을 함께 보낸다. 이용권 여부는 서버가 토큰으로 판단한다.
    const bearer = m && !opts.asGuest ? await m.accessToken() : null;
    res = await requestReport({ token, answers, secs }, bearer);
  } catch (e) {
    if (my !== generation) return;
    const f = e instanceof ApiFailure ? e : new ApiFailure('알 수 없는 오류가 났습니다.', null);
    if (adv && f.code === 'level_unavailable') {
      // 풀이 중에 서버가 심화를 닫은 경우: 이 답은 채점할 수 없으므로 준비 중 안내로 바꾼다
      (await adv).renderUnavailable(app, { basic: start, home: goHome });
      return;
    }
    if (m && f.code === 'auth_invalid') {
      // 로그인 토큰이 거부됨: 한 번 갱신해서 다시 보내 보고, 그래도 안 되면 다시 로그인하거나 무료 결과로 볼 수 있게 한다
      if (!opts.retried && (await m.refreshToken())) return submit(my, token, answers, secs, { retried: true });
      showError('로그인을 다시 확인해야 합니다', `${f.message} 입력한 답은 그대로 남아 있습니다.`, [
        { label: '다시 로그인', primary: true, run: () => void m.chooseAndSignIn('/diagnosis/') },
        { label: '로그아웃하고 무료 결과 보기', run: () => void m.signOut().then(() => submit(my, token, answers, secs, { asGuest: true })) },
        { label: '홈으로', run: goHome },
      ]);
      return;
    }
    showError(
      '결과를 받지 못했습니다',
      f.needsNewSession ? f.message : `${f.message} 입력한 답은 그대로 남아 있습니다.`,
      f.needsNewSession
        ? [
            { label: '새 문제로 진단', primary: true, run: start },
            { label: '홈으로', run: goHome },
          ]
        : [
            { label: '다시 보내기', primary: true, run: () => submit(my, token, answers, secs) },
            { label: '홈으로', run: goHome },
          ],
    );
    return;
  }
  if (my !== generation) return;
  renderResult(app, res, start);
  if (adv) (await adv).decorateResult(app, res, start);
  if (m) {
    // 채점 결과를 정상적으로 받은 시점에 무료 진단 사용 표시를 남긴다(이 브라우저에만)
    m.markFreeUsed();
    m.setLeaveWarning(RESULT_LEAVE_WARNING);
    if (res.gated) m.fillLocked(app);
  }
}

/** 첫 화면: 이용권 구매 버튼으로 로그인했다가 돌아왔으면 구매 화면, 아니면 진단 시작 */
async function boot() {
  if (mon) {
    const m = await mon;
    if (m.returnedForPurchase) {
      ++generation;
      m.renderPaywall(app, 'purchase', { start, home: goHome });
      return;
    }
  }
  void start();
}

void boot();
