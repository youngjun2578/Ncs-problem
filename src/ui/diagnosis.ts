import '../styles/main.css';
import { TEMPLATES } from '../../server/registry';
import { AREAS } from '../../server/areas';
import { generateSet } from '../../server/engine/set';
import { newSeed } from '../../server/engine/rng';
import { runTest } from './test';
import { renderResult } from './result';

const app = document.getElementById('app')!;
const areas = AREAS.filter((a) => TEMPLATES.some((t) => t.area === a.id));
const PER_AREA = 3;

/** 풀이 중에는 머리말·꼬리말을 숨겨 문제에만 집중하게 한다 */
const setTesting = (on: boolean) => document.body.classList.toggle('testing', on);

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

// 안내 화면 없이 바로 1번 문항부터 시작한다. 풀이 시간은 1번 문항이 그려질 때부터 잰다.
start();
