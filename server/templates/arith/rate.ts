import type { Template, Generated } from '../../engine/types.js';
import type { Rng } from '../../engine/rng.js';
import { num, round } from '../../engine/format.js';
import { nearBy } from '../../engine/choices.js';
import { eunNeun, iGa, euro } from '../common.js';

const pctf = (v: number) => `${num(v)}%`;
const ITEMS = [
  { what: '매출액', unit: '억 원' },
  { what: '방문자 수', unit: '명' },
  { what: '생산량', unit: '톤' },
  { what: '민원 접수 건수', unit: '건' },
];

function growth(rng: Rng): Generated {
  const it = rng.pick(ITEMS);
  const up = rng.chance(0.65);
  const r = rng.pick(up ? [5, 10, 12.5, 15, 20, 25, 30, 40, 50] : [5, 10, 12.5, 15, 20, 25, 30, 40]);
  let A = 0;
  for (let i = 0; i < 200; i++) {
    const cand = rng.int(8, 60) * (it.unit === '억 원' ? 10 : 40);
    if (Number.isInteger((cand * r) / 100)) {
      A = cand;
      break;
    }
  }
  if (!A) A = 400;
  const B = up ? A + (A * r) / 100 : A - (A * r) / 100;
  const word = up ? '증가율' : '감소율';
  const text = rng.pick([
    `한 기관의 ${eunNeun(it.what)} 작년 ${num(A)}${it.unit}에서 올해 ${euro(num(B) + it.unit)} ${up ? '늘었다' : '줄었다'}. 작년 대비 올해 ${it.what}의 ${word}은 몇 %인가?`,
    `작년 ${num(A)}${it.unit}이던 ${iGa(it.what)} 올해 ${iGa(num(B) + it.unit)} 되었다. 전년 대비 ${word}을 구하면?`,
    `${it.what}: 작년 ${num(A)}${it.unit}, 올해 ${num(B)}${it.unit}. 작년을 기준으로 한 ${word}은 몇 %인가?`,
  ]);
  const diff = Math.abs(B - A);
  return {
    text,
    answer: r,
    wrongs: [
      { value: round((diff / B) * 100, 1), mistakeTag: '기준량 혼동' },
      { value: round((B / A) * 100, 1), mistakeTag: '비율·증가율 혼동' },
      // 증가량을 %로 착각: %처럼 보일 수 있는 크기일 때만
      ...(diff < 100 ? [{ value: diff, mistakeTag: '증가량·증가율 혼동' as const }] : []),
      { value: round((A / B) * 100, 1), mistakeTag: '기준량 혼동' },
      { value: round((diff / ((A + B) / 2)) * 100, 1), mistakeTag: '기준량 혼동' },
    ],
    format: pctf,
    near: nearBy(r, 2.5),
    steps: [
      `${up ? '증가' : '감소'}량 = |${num(B)} − ${num(A)}| = ${num(diff)}${it.unit}`,
      `${word} = ${num(diff)} ÷ ${num(A)} (작년, 기준) × 100 = ${num(r)}%`,
      `올해 값(${num(B)})으로 나누면 기준량을 잘못 잡은 거예요.`,
    ],
  };
}

function reverse(rng: Rng): Generated {
  const it = rng.pick(ITEMS);
  const r = rng.pick([10, 20, 25, 50, 60, 5, 15, 30]);
  let A = 0;
  for (let i = 0; i < 200; i++) {
    const cand = rng.int(4, 40) * 20;
    if (Number.isInteger((cand * r) / 100)) {
      A = cand;
      break;
    }
  }
  if (!A) A = 400;
  const B = A + (A * r) / 100;
  return {
    text: rng.pick([
      `올해 ${eunNeun(it.what)} ${euro(num(B) + it.unit)}, 작년보다 ${r}% 증가했다. 작년 ${eunNeun(it.what)} 얼마인가?`,
      `전년 대비 ${r}% 늘어 올해 ${iGa(num(B) + it.unit)} 된 ${iGa(it.what)} 있다. 전년의 ${eunNeun(it.what)} 얼마인가?`,
    ]),
    answer: A,
    wrongs: [
      { value: round(B * (1 - r / 100)), mistakeTag: '기준량 혼동' },
      { value: B - r, mistakeTag: '증가량·증가율 혼동' },
      { value: round(B * (1 + r / 100)), mistakeTag: '시점 혼동' },
      { value: round((B * r) / 100), mistakeTag: '구하는 대상 혼동' },
    ],
    format: (v) => `${num(v)}${it.unit}`,
    near: nearBy(A, A >= 200 ? 20 : 10),
    steps: [
      `작년 값을 x라 하면 x × (1 + ${r}/100) = ${num(B)}`,
      `x = ${num(B)} ÷ ${num(1 + r / 100)} = ${num(A)}${it.unit}`,
      `올해 값에서 ${r}%를 빼면(${num(round(B * (1 - r / 100)))}) 기준이 올해로 바뀌어 틀려요.`,
    ],
  };
}

function chain(rng: Rng): Generated {
  const [x, y] = rng.pick([[25, 10], [20, 10], [50, 20], [40, 25], [30, 10], [60, 25], [20, 5], [50, 30], [40, 20], [25, 4]]);
  const net = round(((100 + x) * (100 - y)) / 100 - 100, 1);
  const it = rng.pick(['상품 가격', '주가', '월 이용자 수']);
  return {
    text: rng.pick([
      `${iGa(it)} 1월에 ${x}% 오른 뒤 2월에 ${y}% 내렸다. 처음과 비교하면 몇 % 올랐는가?`,
      `어떤 ${iGa(it)} 첫 달에 ${x}% 증가하고 다음 달에 전달 대비 ${y}% 감소했다. 처음 대비 증가율은 몇 %인가?`,
    ]),
    answer: net,
    wrongs: [
      { value: x - y, mistakeTag: '퍼센트 단순 합산' },
      { value: x, mistakeTag: '조건 누락' },
      { value: 100 + net, mistakeTag: '비율·증가율 혼동' },
      { value: x + y, mistakeTag: '증감 방향 오독' },
    ],
    format: pctf,
    near: nearBy(net, 1),
    steps: [
      `처음 값을 100이라 하면 ${x}% 오른 뒤 ${100 + x}`,
      `여기서 ${y}% 내리면 ${100 + x} × ${num(1 - y / 100)} = ${num(100 + net)}`,
      `따라서 처음보다 ${num(net)}% 올랐어요. ${x} − ${y} = ${x - y}%로 빼면 두 번째 기준(${100 + x})을 무시한 거예요.`,
    ],
  };
}

export const rate: Template = {
  id: 'arith.rate',
  area: 'arith',
  subtype: '증가율·비율',
  difficulty: 1,
  generate: (rng) => rng.pick([growth, growth, reverse, chain])(rng),
};
