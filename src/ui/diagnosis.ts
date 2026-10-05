import '../styles/main.css';
import { TEMPLATES } from '../registry';
import { AREAS } from '../areas';
import { generateSet } from '../engine/set';
import { newSeed } from '../engine/rng';
import { runTest } from './test';
import { renderResult } from './result';

const app = document.getElementById('app')!;
const areas = AREAS.filter((a) => TEMPLATES.some((t) => t.area === a.id));
const PER_AREA = 3;

/** 풀이 중에는 머리말·꼬리말을 숨겨 문제에만 집중하게 한다 */
const setTesting = (on: boolean) => document.body.classList.toggle('testing', on);

function renderReady() {
  const n = areas.length * PER_AREA;
  app.innerHTML = `
  <main class="page" id="main">
    <p class="eyebrow">수리능력 연습 진단</p>
    <h1 class="title" tabindex="-1">시작 전 안내</h1>
    <dl class="facts">
      <div><dt>문항</dt><dd>${n}문항 · 5지선다<br><span class="sub">${areas.map((a) => a.name).join(' · ')} 영역별 ${PER_AREA}문항</span></dd></div>
      <div><dt>예상 시간</dt><dd>약 ${Math.round((n * 75) / 60)}분</dd></div>
      <div><dt>진행 방식</dt><dd>보기를 고르면 바로 다음 문항으로 넘어갑니다. 이전 문항으로 돌아가 답을 바꿀 수 있고, 정답과 해설은 모든 문항을 푼 뒤에 공개됩니다.</dd></div>
      <div><dt>준비물</dt><dd>계산용 종이와 펜</dd></div>
    </dl>
    <p class="note">풀이 기록은 이 브라우저 화면에서만 쓰이며 어디에도 저장·전송되지 않습니다. 페이지를 새로 고치면 처음부터 다시 시작합니다.</p>
    <button type="button" class="btn-primary btn-block" id="go">진단 시작</button>
  </main>`;
  document.getElementById('go')!.addEventListener('click', start);
}

function start() {
  const qs = generateSet(TEMPLATES, newSeed(), { areas: areas.map((a) => a.id), perArea: PER_AREA });
  setTesting(true);
  runTest(
    app,
    qs,
    (attempts, totalSec) => {
      setTesting(false);
      renderResult(app, qs, attempts, totalSec, start);
    },
    {
      home: () => {
        window.location.href = '/';
      },
      // 같은 시드를 쓰지 않고 새 시드로 12문항을 새로 만든다
      restart: start,
    },
  );
}

renderReady();
