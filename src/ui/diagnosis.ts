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

async function start() {
  const my = ++generation;
  setTesting(false);
  showStatus('문제를 준비하고 있습니다…');
  let session;
  try {
    session = await startSession();
  } catch (e) {
    if (my !== generation) return;
    showError('문제를 불러오지 못했습니다', e instanceof ApiFailure ? e.message : '알 수 없는 오류가 났습니다.', [
      { label: '다시 시도', primary: true, run: start },
      { label: '홈으로', run: goHome },
    ]);
    return;
  }
  if (my !== generation) return;
  setTesting(true);
  runTest(app, session.questions, (answers, secs) => submit(my, session.token, answers, secs), {
    home: goHome,
    // 같은 세트를 다시 쓰지 않고 서버에 새 세션을 요청한다
    restart: start,
  });
}

/** 채점 요청. 실패해도 답과 시간은 그대로 두고 다시 보낼 수 있다. */
async function submit(my: number, token: string, answers: number[], secs: number[]) {
  if (my !== generation) return;
  setTesting(false);
  showStatus('채점하고 있습니다…');
  let res: ReportResponse;
  try {
    res = await requestReport({ token, answers, secs });
  } catch (e) {
    if (my !== generation) return;
    const f = e instanceof ApiFailure ? e : new ApiFailure('알 수 없는 오류가 났습니다.', null);
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
}

start();
