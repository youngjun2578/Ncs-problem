import type { Template, Generated } from '../../engine/types.js';
import type { Rng } from '../../engine/rng.js';
import { num } from '../../engine/format.js';
import { nearBy } from '../../engine/choices.js';
import { frac, fracLabel, fracShow } from '../../engine/frac.js';
import { gcd } from '../../engine/format.js';
import { pair, eunNeun, ieyo } from '../common.js';

/** 1/a + 1/b를 최소공배수로 통분해 보여 준다. 예: "1/12 + 1/36 = 3/36 + 1/36 = 4/36 = 1/9" */
function sumSteps(a: number, b: number) {
  const L = (a / gcd(a, b)) * b;
  const f = frac(L / a + L / b, L);
  return { shown: `1/${a} + 1/${b} = ${L / a}/${L} + ${L / b}/${L} = ${fracShow(L / a + L / b, L)}`, label: fracLabel(f), n: f.n, d: f.d };
}

const PAIRS = [[6, 12], [10, 15], [12, 24], [20, 30], [15, 30], [30, 60], [9, 18], [8, 24], [14, 35], [10, 40], [18, 36], [12, 36]];

function together(rng: Rng): Generated {
  let [a, b] = rng.pick(PAIRS);
  if (rng.chance(0.5)) [a, b] = [b, a];
  const ans = (a * b) / (a + b);
  const [p1, p2] = pair(rng);
  const v = rng.int(0, 2);
  const unit = v === 1 ? '시간' : '일';
  const text = [
    `어떤 일을 ${p1} 혼자 하면 ${a}일, ${p2} 혼자 하면 ${b}일이 걸린다. 두 사람이 함께 하면 며칠이 걸리는가?`,
    `빈 물탱크를 A 관 하나로만 채우면 ${a}시간, B 관 하나로만 채우면 ${b}시간이 걸린다. 두 관을 동시에 열면 물탱크를 가득 채우는 데 몇 시간이 걸리는가?`,
    `자료 입력 작업을 ${eunNeun(p1)} 혼자서 ${a}일, ${eunNeun(p2)} 혼자서 ${b}일 만에 끝낼 수 있다. 처음부터 둘이 같이 작업하면 며칠 만에 끝나는가?`,
  ][v];
  const sum = sumSteps(a, b);
  const per = unit === '일' ? '하루' : '한 시간';
  return {
    text,
    answer: ans,
    wrongs: [
      { value: (a + b) / 2, mistakeTag: '산술평균 착각' },
      { value: a + b, mistakeTag: '일수 합산 오류' },
      { value: Math.abs(a - b), mistakeTag: '일수 합산 오류' },
      { value: Math.min(a, b), mistakeTag: '한 구간만 반영' },
    ],
    format: (x) => `${num(x)}${unit}`,
    near: nearBy(ans, 1),
    steps: [
      `${v === 1 ? '물탱크 전체를' : '전체 일의 양을'} 1이라 하면, ${per}에 ${v === 1 ? '채우는 양' : '하는 일'}은 ${ieyo(sum.shown)}.`,
      `걸리는 ${unit === '일' ? '날' : '시간'} = 1 ÷ ${sum.label} = ${sum.n === 1 ? '' : `${sum.d} ÷ ${sum.n} = `}${num(ans)}${unit}`,
      v === 1
        ? `걸리는 시간을 더하거나 평균 내면 안 돼요. 더할 수 있는 것은 한 시간 동안 채우는 물의 양이에요.`
        : `일수를 더하거나 평균 내면 안 돼요. 더할 수 있는 것은 하루 동안 하는 일의 양이에요.`,
    ],
  };
}

function partial(rng: Rng): Generated {
  let a = 12, b = 24, k = 4, ans = 6;
  const L = [6, 8, 9, 10, 12, 15, 18, 20, 24, 30];
  for (let i = 0; i < 500; i++) {
    const A = rng.pick(L), B = rng.pick(L), K = rng.int(2, 8);
    if (A === B) continue;
    const n = A * B - K * (A + B);
    if (n <= 0 || n % B !== 0) continue;
    [a, b, k, ans] = [A, B, K, n / B];
    break;
  }
  const rest = a * b - k * (a + b);
  const [p1, p2] = pair(rng);
  const sum = sumSteps(a, b);
  const done = frac(k * sum.n, sum.d);
  const left = fracLabel(frac(done.d - done.n, done.d));
  return {
    text: rng.pick([
      `어떤 일을 ${p1} 혼자 하면 ${a}일, ${p2} 혼자 하면 ${b}일이 걸린다. 두 사람이 함께 ${k}일 동안 일한 뒤, 나머지는 ${p1} 혼자 마무리했다. ${p1} 혼자 일한 기간은 며칠인가?`,
      `${eunNeun(p1)} ${a}일, ${eunNeun(p2)} ${b}일 걸리는 작업이 있다. 처음 ${k}일은 둘이 함께 하고, 그 뒤로는 ${p2} 없이 ${p1} 혼자 일해서 작업을 끝냈다. ${p1} 혼자 일한 날은 며칠인가?`,
    ]),
    answer: ans,
    wrongs: [
      { value: k, mistakeTag: '구하는 대상 혼동' },
      { value: ans + k, mistakeTag: '구하는 대상 혼동' },
      { value: a - k, mistakeTag: '일수 합산 오류' },
      { value: Math.round(rest / a), mistakeTag: '일률 혼동' },
    ],
    format: (x) => `${num(x)}일`,
    near: nearBy(ans, 1),
    steps: [
      `함께 하루에 하는 일 = ${sum.shown}`,
      `${k}일 동안 한 일 = ${k} × ${sum.label} = ${fracShow(k * sum.n, sum.d)}, 남은 일 = 1 − ${fracLabel(done)} = ${left}`,
      `${eunNeun(p1)} 하루에 1/${a}만큼 하므로 ${left} ÷ 1/${a} = ${ans}일`,
    ],
  };
}

export const work: Template = {
  id: 'arith.work',
  area: 'arith',
  subtype: '일의 양',
  difficulty: 3,
  generate: (rng) => (rng.chance(0.55) ? together(rng) : partial(rng)),
};
