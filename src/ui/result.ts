import type { Problem } from '../../server/engine/types';
import { analyze, LEVEL_LABEL, type Attempt, type AreaReport, type Report } from '../../server/report/analyze';
import { AREA_BY_ID } from '../../server/areas';
import { renderChart, renderFigure } from '../../shared/charts/render';
import { CIRC, esc, fmtDuration } from './dom';

const pct = (r: number) => `${Math.round(r * 100)}%`;
const two = (n: number) => String(n).padStart(2, '0');

function levelBadge(a: AreaReport) {
  return `<span class="level level-${a.level}"><span class="level-mark" aria-hidden="true"></span>${LEVEL_LABEL[a.level]}</span>`;
}

function meter(rate: number) {
  return `<span class="meter" aria-hidden="true"><span class="meter-fill" style="width:${Math.round(rate * 100)}%"></span></span>`;
}

function summaryTable(r: Report) {
  const rows = r.areas
    .map(
      (a) => `<tr class="area-row">
        <th scope="row"><button type="button" class="area-toggle" aria-expanded="false" aria-controls="area-${a.meta.id}">${a.meta.name}<span class="sr-only"> 상세 보기</span></button></th>
        <td class="num">${a.correct}/${a.total} <span class="sub">(${pct(a.rate)})</span>${meter(a.rate)}</td>
        <td class="num">${fmtDuration(a.avgSec)}</td>
        <td>${levelBadge(a)}</td>
      </tr>
      <tr class="area-detail" id="area-${a.meta.id}" hidden><td colspan="4">${areaDetail(a)}</td></tr>`,
    )
    .join('');
  return `<table class="summary">
    <caption class="sr-only">영역별 정답률, 평균 풀이 시간, 수준. 영역 이름을 누르면 상세가 펼쳐집니다.</caption>
    <thead><tr><th scope="col">영역</th><th scope="col">정답</th><th scope="col">문항당 평균</th><th scope="col">수준</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

/** 요약 표에서 영역 이름을 누르면 그 행 아래에 펼쳐지는 상세 */
function areaDetail(a: AreaReport) {
  const patterns = a.patterns.length
    ? `<ul class="patterns">${a.patterns
        .map((p) => `<li><span class="pattern-tag">${p.tag}${p.count > 1 ? ` · ${p.count}회` : ''}</span><span class="pattern-text">${p.text}</span></li>`)
        .join('')}</ul>`
    : `<p class="muted">이번 진단에서는 이 영역의 오답이 없어 실수 패턴을 판단할 근거가 없어요.</p>`;
  return `
  <div class="area">
    <p class="area-desc">${a.meta.description}</p>
    <dl class="kv">
      <div><dt>정답률</dt><dd class="num">${a.correct}/${a.total} (${pct(a.rate)})</dd></div>
      <div><dt>문항당 평균 시간</dt><dd class="num">${fmtDuration(a.avgSec)} <span class="sub">권장 ${a.meta.targetSec}초 이내</span></dd></div>
      <div><dt>취약 유형</dt><dd>${a.weakSubtypes.length ? a.weakSubtypes.join(', ') : '없음'}</dd></div>
    </dl>
    <p class="level-reason">${a.levelReason}</p>
    <h3>틀린 패턴</h3>
    ${patterns}
  </div>`;
}

function choiceView(q: Problem, k: number) {
  const c = q.choices[k];
  if (c.chart) return `<div class="ans-chart">${renderChart(c.chart, { w: 320, h: 170 })}</div>`;
  return `<span class="ans-text">${c.label}</span>`;
}

function itemDetail(q: Problem, a: Attempt | undefined, i: number) {
  const ok = a?.picked === q.answerIndex;
  const picked = a ? q.choices[a.picked] : undefined;
  return `
  <details class="item">
    <summary>
      <span class="item-no">${two(i + 1)}</span>
      <span class="item-title">${AREA_BY_ID[q.area].name} · ${q.subtype}</span>
      <span class="mark-result ${ok ? 'ok' : 'no'}">${ok ? '정답' : '오답'}</span>
    </summary>
    <div class="item-body">
      <p class="q">${q.text}</p>
      ${q.figure ? renderFigure(q.figure) : ''}
      <dl class="answers">
        <div><dt>내 답</dt><dd>${a ? `${CIRC[a.picked]} ${choiceView(q, a.picked)}` : '선택 없음'}</dd></div>
        <div><dt>정답</dt><dd>${CIRC[q.answerIndex]} ${choiceView(q, q.answerIndex)}</dd></div>
      </dl>
      ${!ok && picked?.mistakeTag ? `<p class="why">고른 보기는 <b>${esc(picked.mistakeTag)}</b>에서 나오는 값이에요.</p>` : ''}
      <h4>풀이</h4>
      <ol class="steps">${q.steps.map((s) => `<li>${s}</li>`).join('')}</ol>
    </div>
  </details>`;
}

export function renderResult(app: HTMLElement, qs: Problem[], attempts: Attempt[], totalSec: number, retry: () => void) {
  const r = analyze(qs, attempts, totalSec);
  const when = new Date().toLocaleString('ko-KR', { dateStyle: 'long', timeStyle: 'short' });
  const perArea = r.areas[0]?.total ?? 0;
  app.innerHTML = `
  <main class="page report" id="main">
    <header class="doc-head">
      <p class="eyebrow">영역별 결과 · NCS 테스트</p>
      <h1 class="title">NCS 수리능력 진단 리포트</h1>
      <dl class="meta">
        <div><dt>진단 일시</dt><dd>${when}</dd></div>
        <div><dt>문항 구성</dt><dd>${r.total}문항 (영역별 ${perArea}문항)</dd></div>
        <div><dt>총 풀이 시간</dt><dd class="num">${fmtDuration(totalSec)}</dd></div>
        <div><dt>참고 점수</dt><dd class="num">${r.correct} / ${r.total}</dd></div>
      </dl>
      <p class="notice"><b>참고용 결과입니다.</b> 영역마다 ${perArea}문항으로 판정해 우연의 영향이 큽니다. 실력을 확정하는 점수가 아니라 다음에 무엇을 공부할지 정하는 데 활용하세요.</p>
    </header>

    <section aria-labelledby="h-summary">
      <h2 id="h-summary" class="section-title">영역별 요약</h2>
      <p class="muted no-print">영역 이름을 누르면 설명, 취약 유형, 틀린 패턴이 펼쳐집니다. 인쇄할 때는 모두 펼쳐서 출력돼요.</p>
      ${summaryTable(r)}
    </section>

    <section aria-labelledby="h-items" class="items">
      <h2 id="h-items" class="section-title">문항별 해설</h2>
      <p class="muted no-print">각 문항을 누르면 풀이가 펼쳐집니다. 인쇄할 때는 모두 펼쳐서 출력돼요.</p>
      ${qs.map((q, i) => itemDetail(q, attempts[i], i)).join('')}
    </section>

    <div class="actions no-print">
      <button type="button" class="btn-primary" id="retry">새 문제로 진단</button>
      <button type="button" class="btn-secondary" id="print">인쇄 / PDF로 저장</button>
    </div>
    <p class="fine">문제는 모두 직접 만든 템플릿에서 생성한 연습용 문제이며, 실제 채용 시험의 출제 범위·난이도와 다를 수 있습니다.</p>

    <aside class="ad-slot no-print" aria-label="광고" data-ad-slot="result-bottom">${import.meta.env.DEV ? '<span>광고 영역 (개발 모드 표시)</span>' : ''}</aside>
  </main>`;
  app.querySelectorAll<HTMLButtonElement>('.area-toggle').forEach((b) =>
    b.addEventListener('click', () => {
      const open = b.getAttribute('aria-expanded') !== 'true';
      b.setAttribute('aria-expanded', String(open));
      document.getElementById(b.getAttribute('aria-controls')!)!.hidden = !open;
    }),
  );
  document.getElementById('retry')!.addEventListener('click', retry);
  document.getElementById('print')!.addEventListener('click', () => window.print());
  window.scrollTo(0, 0);
  (app.querySelector('.title') as HTMLElement | null)?.setAttribute('tabindex', '-1');
  (app.querySelector('.title') as HTMLElement | null)?.focus({ preventScroll: true });
}

// 인쇄할 때는 접힌 해설을 모두 펼치고, 끝나면 원래대로 돌린다
let reopened: HTMLDetailsElement[] = [];
window.addEventListener('beforeprint', () => {
  reopened = [...document.querySelectorAll<HTMLDetailsElement>('details.item:not([open])')];
  reopened.forEach((d) => (d.open = true));
});
window.addEventListener('afterprint', () => {
  reopened.forEach((d) => (d.open = false));
  reopened = [];
});
