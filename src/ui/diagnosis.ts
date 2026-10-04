import '../styles/main.css';
import { TEMPLATES } from '../registry';
import { AREAS } from '../areas';
import { generateSet } from '../engine/set';
import { newSeed } from '../engine/rng';
import { runTest } from './test';
import { renderResult } from './result';

const app = document.getElementById('app')!;
const areas = AREAS.filter((a) => TEMPLATES.some((t) => t.area === a.id)).map((a) => a.id);
const PER_AREA = 3;

function renderReady() {
  const n = areas.length * PER_AREA;
  app.innerHTML = `
  <main class="page" id="main">
    <p class="eyebrow">NCS 수리능력 연습 진단</p>
    <h1 class="title">시작 전 안내</h1>
    <dl class="facts">
      <div><dt>문항</dt><dd>${n}문항 · 5지선다 (영역별 ${PER_AREA}문항)</dd></div>
      <div><dt>예상 시간</dt><dd>약 ${Math.round(n * 1.2)}분</dd></div>
      <div><dt>진행 방식</dt><dd>보기를 고르면 바로 다음 문항으로 넘어가며, 이전 문항으로 돌아갈 수 없습니다. 정답과 해설은 마지막에 공개됩니다.</dd></div>
    </dl>
    <p class="note">계산을 위해 종이와 펜을 준비하세요. 풀이 기록은 이 브라우저 화면에서만 쓰이고 어디에도 저장·전송되지 않습니다.</p>
    <button type="button" class="btn-primary" id="go">진단 시작</button>
  </main>`;
  document.getElementById('go')!.addEventListener('click', start);
}

function start() {
  const qs = generateSet(TEMPLATES, newSeed(), { areas, perArea: PER_AREA });
  runTest(app, qs, (attempts, totalSec) => {
    renderResult(app, qs, attempts, totalSec, start);
  });
}

renderReady();
