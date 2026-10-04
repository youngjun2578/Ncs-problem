import type { Problem } from '../engine/types';
import type { Attempt } from './test';
import { CIRC, fmtDuration } from './dom';

export function renderResult(app: HTMLElement, qs: Problem[], attempts: Attempt[], totalSec: number, retry: () => void) {
  const right = qs.filter((q, k) => attempts[k]?.picked === q.answerIndex).length;
  const items = qs
    .map((q, k) => {
      const ok = attempts[k]?.picked === q.answerIndex;
      const mine = q.choices[attempts[k].picked];
      return `<details><summary>${ok ? '정답' : '오답'} · ${k + 1}번 ${q.subtype}</summary>
      <p class="q">${q.text}</p><p>내 답: ${CIRC[attempts[k].picked]} ${mine.label}</p>
      <p><b>정답: ${CIRC[q.answerIndex]} ${q.choices[q.answerIndex].label}</b></p>
      <ol>${q.steps.map((s) => `<li>${s}</li>`).join('')}</ol></details>`;
    })
    .join('');
  app.innerHTML = `<main class="page"><h1 class="title">${qs.length}문항 중 ${right}문항 정답</h1>
    <p>풀이 시간 ${fmtDuration(totalSec)}</p>${items}
    <button type="button" class="btn-primary" id="retry">새 문제로 다시 풀기</button></main>`;
  document.getElementById('retry')!.addEventListener('click', retry);
  window.scrollTo(0, 0);
}
