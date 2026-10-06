import '../styles/advanced.css';
import type { ReportResponse, SessionResponse } from '../../shared/api';
import { startAdvancedSession, startSession } from './api';
import { esc } from './dom';

/*
 * 심화 진단 화면(VITE_ADVANCED_LEVEL_ENABLED=true로 빌드했을 때만 diagnosis.ts가 동적으로 불러온다).
 *  - 진입: 주소 /diagnosis/?level=advanced(값이 정확히 advanced일 때만), 기본 결과 화면의 "심화로 다시 진단" 버튼
 *  - 서버가 심화를 막으면(403 level_unavailable) 오류 대신 준비 중 안내와 "기본으로 진단하기"
 *  - 결과 화면의 심화 표시는 주소가 아니라 서버 응답의 meta.level(서명된 토큰에서 나온 값)로 정한다
 * 브라우저 저장소는 쓰지 않는다. 지금 고른 수준은 주소(?level=advanced)에만 남긴다.
 */

let advanced = new URLSearchParams(window.location.search).get('level') === 'advanced';

/** 지금 진단할 수준이 심화인가 */
export const isAdvanced = () => advanced;

/** 수준을 바꾸고 주소에도 반영한다(새로 고침해도 같은 수준으로 시작) */
export function setAdvanced(on: boolean) {
  advanced = on;
  const url = new URL(window.location.href);
  if (on) url.searchParams.set('level', 'advanced');
  else url.searchParams.delete('level');
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}

/** 지금 수준으로 세션 요청 */
export const requestSession = (): Promise<SessionResponse> => (advanced ? startAdvancedSession() : startSession());

export const UNAVAILABLE = {
  title: '심화 난이도는 아직 준비 중입니다',
  message: '지금은 기본 난이도로만 진단할 수 있습니다. 기본 진단은 바로 시작할 수 있습니다.',
  basic: '기본으로 진단하기',
  home: '홈으로',
};
export const RESULT_NOTE = '심화 난이도 결과입니다. 기본 결과와 직접 비교하지 않습니다.';
export const RETRY_ADVANCED = '심화로 다시 진단';

/** 서버가 심화를 막았을 때의 안내 화면 */
export function renderUnavailable(app: HTMLElement, go: { basic: () => void; home: () => void }) {
  app.innerHTML = `
  <main class="page" id="main">
    <h1 class="title" tabindex="-1">${esc(UNAVAILABLE.title)}</h1>
    <p class="notice" role="status">${esc(UNAVAILABLE.message)}</p>
    <div class="actions">
      <button type="button" class="btn-primary" id="adv-basic">${esc(UNAVAILABLE.basic)}</button>
      <button type="button" class="btn-secondary" id="adv-home">${esc(UNAVAILABLE.home)}</button>
    </div>
  </main>`;
  document.getElementById('adv-basic')!.addEventListener('click', () => {
    setAdvanced(false);
    go.basic();
  });
  document.getElementById('adv-home')!.addEventListener('click', go.home);
  (app.querySelector('.title') as HTMLElement).focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

/**
 * 결과 화면(result.ts가 그린 뒤)에 심화 표시를 더한다.
 *  - 심화 결과: 제목 옆 "심화" 표시와 안내 한 줄(인쇄에도 나온다)
 *  - 기본 결과: "심화로 다시 진단" 버튼
 */
export function decorateResult(app: HTMLElement, res: ReportResponse, startAdvanced: () => void) {
  // 다음 "새 문제로 진단"이 같은 수준으로 시작하도록 서버가 알려 준 수준을 따른다
  setAdvanced(res.meta.level === 'advanced');
  if (res.meta.level === 'advanced') {
    const title = app.querySelector('.doc-head .title');
    title?.insertAdjacentHTML('beforeend', ' <span class="level-badge">심화</span>');
    app.querySelector('.doc-head .notice')?.insertAdjacentHTML('beforebegin', `<p class="notice level-note">${esc(RESULT_NOTE)}</p>`);
    return;
  }
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn-secondary';
  btn.id = 'retry-advanced';
  btn.textContent = RETRY_ADVANCED;
  btn.addEventListener('click', () => {
    setAdvanced(true);
    startAdvanced();
  });
  app.querySelector('#retry')?.insertAdjacentElement('afterend', btn);
}
