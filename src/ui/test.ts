import type { Problem } from '../engine/types';
import { AREA_BY_ID } from '../areas';
import { renderChart, renderFigure } from '../charts/render';
import { CIRC, fmtClock, prefersReducedMotion } from './dom';

export interface Attempt {
  /** 고른 보기 번호 */
  picked: number;
  /** 이 문항에 쓴 시간(초) */
  sec: number;
}

const ADVANCE_MS = 380;

/** 풀이 화면. 보기를 고르면 자동으로 다음 문항, 정답은 끝날 때까지 보여주지 않는다. */
export function runTest(app: HTMLElement, qs: Problem[], onDone: (attempts: Attempt[], totalSec: number) => void) {
  const attempts: Attempt[] = [];
  const t0 = Date.now();
  let qStart = Date.now();
  let i = 0;
  let locked = false;

  const timer = window.setInterval(tick, 1000);
  function tick() {
    const el = document.getElementById('clock');
    if (el) el.textContent = fmtClock(Math.floor((Date.now() - t0) / 1000));
  }

  function render() {
    const q = qs[i], n = qs.length;
    const segs = qs
      .map((p, k) => `<span class="seg ${k < i ? 'done' : k === i ? 'now' : ''} ${k > 0 && qs[k - 1].area !== p.area ? 'area-start' : ''}"></span>`)
      .join('');
    const isChart = q.choices.some((c) => c.chart);
    const choices = q.choices
      .map((c, k) => {
        const body = c.chart
          ? `<span class="choice-chart">${renderChart(c.chart, { w: 320, h: 170 })}</span>`
          : `<span class="choice-text">${c.label}</span>`;
        return `<li><button type="button" class="choice" data-k="${k}"><span class="mark" aria-hidden="true">${CIRC[k]}</span><span class="sr-only">${k + 1}번</span>${body}</button></li>`;
      })
      .join('');
    app.innerHTML = `
    <header class="progress" aria-label="진행 상황">
      <div class="progress-in">
        <div class="progress-top">
          <span class="count"><b>${i + 1}</b> / ${n}</span>
          <span class="area-now">${AREA_BY_ID[q.area].name}</span>
          <span class="clock" aria-label="경과 시간"><span id="clock">00:00</span></span>
        </div>
        <div class="segs" role="progressbar" aria-label="풀이 진행" aria-valuemin="0" aria-valuemax="${n}" aria-valuenow="${i}" aria-valuetext="${n}문항 중 ${i}문항 완료">${segs}</div>
      </div>
    </header>
    <main class="page test" id="main">
      <section class="question" aria-labelledby="q-text">
        <p class="q-no">문항 ${i + 1}</p>
        <h1 class="q" id="q-text" tabindex="-1">${q.text}</h1>
        ${q.figure ? renderFigure(q.figure) : ''}
      </section>
      <ol class="choices ${isChart ? 'chart-choices' : ''}" aria-label="보기">${choices}</ol>
      <p class="hint">보기를 누르면 다음 문항으로 넘어갑니다. 키보드 1–5로도 고를 수 있어요.</p>
    </main>`;
    tick();
    window.scrollTo(0, 0);
    (document.getElementById('q-text') as HTMLElement).focus({ preventScroll: true });
    app.querySelectorAll<HTMLButtonElement>('.choice').forEach((b) => b.addEventListener('click', () => pick(Number(b.dataset.k), b)));
    qStart = Date.now();
  }

  function pick(k: number, btn?: HTMLElement) {
    if (locked) return;
    locked = true;
    (btn ?? app.querySelector(`.choice[data-k="${k}"]`))?.classList.add('selected');
    attempts[i] = { picked: k, sec: (Date.now() - qStart) / 1000 };
    window.setTimeout(
      () => {
        locked = false;
        if (i + 1 < qs.length) {
          i++;
          render();
        } else {
          window.clearInterval(timer);
          document.removeEventListener('keydown', onKey);
          onDone(attempts, Math.round((Date.now() - t0) / 1000));
        }
      },
      prefersReducedMotion() ? 120 : ADVANCE_MS,
    );
  }

  function onKey(e: KeyboardEvent) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const k = Number(e.key) - 1;
    if (k >= 0 && k < 5) pick(k);
  }
  document.addEventListener('keydown', onKey);
  render();
}
