import type { PublicQuestion } from '../../shared/api';
import { renderChart, renderFigure } from '../../shared/charts/render';
import { CIRC, confirmDialog, fmtClock, prefersReducedMotion } from './dom';

const ADVANCE_MS = 380;

/**
 * 풀이 화면. 보기를 고르면 자동으로 다음 문항으로 넘어가고, 이전/다음 버튼으로 오갈 수 있다.
 * 정답 여부는 끝날 때까지 보여주지 않는다.
 * 풀이 시간은 문항별로 누적한다: 돌아가서 다시 본 시간도 그 문항에 더한다.
 * 시간은 performance.now()로 잰다(기기 시계가 바뀌어도 음수·급변이 생기지 않는다).
 */
export interface TestExits {
  /** 홈으로 */
  home: () => void;
  /** 새 시드로 처음부터 */
  restart: () => void;
}

export function runTest(app: HTMLElement, qs: PublicQuestion[], onDone: (answers: number[], secs: number[]) => void, exits: TestExits) {
  const n = qs.length;
  const picked: (number | undefined)[] = Array(n).fill(undefined);
  const secs: number[] = Array(n).fill(0);
  const t0 = performance.now();
  let qStart = t0;
  let i = 0;
  let locked = false;
  /** 나가거나 끝난 뒤에는 남은 자동 이동 타이머가 화면을 건드리지 않게 한다 */
  let stopped = false;

  const timer = window.setInterval(tick, 1000);
  function tick() {
    const el = document.getElementById('clock');
    if (el) el.textContent = fmtClock(Math.floor((performance.now() - t0) / 1000));
  }

  /** 지금 문항에 머문 시간을 누적하고 시계를 다시 맞춘다 */
  function settleTime() {
    const now = performance.now();
    secs[i] += (now - qStart) / 1000;
    qStart = now;
  }

  const answered = (k: number) => picked[k] !== undefined;
  const allAnswered = () => picked.every((p) => p !== undefined);

  function render() {
    const q = qs[i];
    const segs = qs
      .map((p, k) => `<span class="seg ${k === i ? 'now' : answered(k) ? 'done' : ''} ${k > 0 && qs[k - 1].area !== p.area ? 'area-start' : ''}"></span>`)
      .join('');
    const isChart = q.choices.some((c) => c.chart);
    const choices = q.choices
      .map((c, k) => {
        const body = c.chart
          ? `<span class="choice-chart">${renderChart(c.chart, { w: 320, h: 170 })}</span>`
          : `<span class="choice-text">${c.label}</span>`;
        const sel = picked[i] === k;
        return `<li><button type="button" class="choice${sel ? ' selected' : ''}" data-k="${k}" aria-pressed="${sel}"><span class="mark" aria-hidden="true">${CIRC[k]}</span><span class="sr-only">${k + 1}번</span>${body}</button></li>`;
      })
      .join('');
    const last = i === n - 1;
    const doneCount = picked.filter((p) => p !== undefined).length;
    app.innerHTML = `
    <header class="progress" aria-label="진행 상황">
      <div class="progress-in">
        <div class="progress-actions">
          <button type="button" class="btn-text" id="home">홈</button>
          <button type="button" class="btn-text" id="restart">처음부터 다시</button>
        </div>
        <div class="progress-top">
          <span class="count"><b>${i + 1}</b> / ${n}</span>
          <span class="area-now">${q.areaName}</span>
          <span class="clock" aria-label="경과 시간"><span id="clock">00:00</span></span>
        </div>
        <div class="segs" role="progressbar" aria-label="풀이 진행" aria-valuemin="0" aria-valuemax="${n}" aria-valuenow="${doneCount}" aria-valuetext="${n}문항 중 ${doneCount}문항 답함">${segs}</div>
      </div>
    </header>
    <main class="page test" id="main">
      <section class="question" aria-labelledby="q-text">
        <p class="q-no">문항 ${i + 1}</p>
        <h1 class="q" id="q-text" tabindex="-1">${q.text}</h1>
        ${q.figure ? renderFigure(q.figure) : ''}
      </section>
      <ol class="choices ${isChart ? 'chart-choices' : ''}" aria-label="보기">${choices}</ol>
      <nav class="q-nav" aria-label="문항 이동">
        <button type="button" class="btn-secondary" id="prev" ${i === 0 ? 'disabled' : ''}>← 이전</button>
        <button type="button" class="btn-secondary" id="next" ${answered(i) && (!last || allAnswered()) ? '' : 'disabled'}>${last ? '결과 보기' : '다음 →'}</button>
      </nav>
      <p class="hint">보기를 누르면 다음 문항으로 넘어갑니다. 이전 문항으로 돌아가 답을 바꿀 수 있고, 정답은 모든 문항을 푼 뒤에 공개됩니다. 키보드: 1–5 선택, ← 이전, → 다음</p>
    </main>`;
    tick();
    window.scrollTo(0, 0);
    (document.getElementById('q-text') as HTMLElement).focus({ preventScroll: true });
    app.querySelectorAll<HTMLButtonElement>('.choice').forEach((b) => b.addEventListener('click', () => pick(Number(b.dataset.k))));
    document.getElementById('prev')!.addEventListener('click', prev);
    document.getElementById('next')!.addEventListener('click', next);
    document.getElementById('home')!.addEventListener('click', () => leave(exits.home, '홈으로 가기'));
    document.getElementById('restart')!.addEventListener('click', () => leave(exits.restart, '처음부터 다시'));
  }

  /** 풀이를 버리고 나간다. 확인창을 거친다. */
  let leaving = false;
  async function leave(go: () => void, okLabel: string) {
    if (leaving) return;
    leaving = true;
    const ok = await confirmDialog('진행 중인 풀이가 사라집니다. 나갈까요?', okLabel);
    leaving = false;
    if (!ok) return;
    stop();
    go();
  }

  function stop() {
    stopped = true;
    window.clearInterval(timer);
    document.removeEventListener('keydown', onKey);
  }

  function goTo(k: number) {
    if (leaving || stopped) return;
    settleTime();
    i = k;
    render();
  }

  function finish() {
    if (leaving || stopped) return;
    settleTime();
    stop();
    // 채점과 총 풀이 시간 계산은 서버가 한다
    onDone(picked as number[], secs.slice());
  }

  /** 다음 칸: 마지막 문항이면 아직 안 푼 첫 문항, 모두 풀었으면 결과 */
  function advance() {
    if (i + 1 < n) goTo(i + 1);
    else if (allAnswered()) finish();
    else goTo(picked.findIndex((p) => p === undefined));
  }

  function pick(k: number) {
    if (locked || leaving) return;
    locked = true;
    picked[i] = k;
    app.querySelectorAll<HTMLButtonElement>('.choice').forEach((b) => {
      const sel = Number(b.dataset.k) === k;
      b.classList.toggle('selected', sel);
      b.setAttribute('aria-pressed', String(sel));
    });
    window.setTimeout(
      () => {
        locked = false;
        advance();
      },
      prefersReducedMotion() ? 120 : ADVANCE_MS,
    );
  }

  function prev() {
    if (locked || i === 0) return;
    goTo(i - 1);
  }

  function next() {
    if (locked || !answered(i)) return;
    if (i === n - 1 && !allAnswered()) return;
    advance();
  }

  function onKey(e: KeyboardEvent) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (document.querySelector('dialog[open]')) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prev();
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      next();
      return;
    }
    const k = Number(e.key) - 1;
    if (k >= 0 && k < 5) pick(k);
  }
  document.addEventListener('keydown', onKey);
  render();
}
