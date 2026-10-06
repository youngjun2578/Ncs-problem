import type { Template, Generated } from '../../engine/types.js';
import type { Rng } from '../../engine/rng.js';
import { num, round } from '../../engine/format.js';
import { nearBy } from '../../engine/choices.js';
import { pair, person, eunNeun, gwaWa, iGa } from '../common.js';

const kmh = (v: number) => `시속 ${num(v)}km`;

function avgRound(rng: Rng): Generated {
  const hiking = rng.chance(1 / 3);
  const pairs = hiking
    ? [[2, 3], [3, 6], [2, 6], [4, 6], [4, 12], [3, 4.5]]
    : [[40, 60], [60, 90], [30, 60], [20, 30], [45, 90], [36, 45], [30, 45], [60, 120], [40, 120], [50, 75]];
  let [v1, v2] = rng.pick(pairs);
  if (rng.chance(0.5)) [v1, v2] = [v2, v1];
  const ans = (2 * v1 * v2) / (v1 + v2);
  const who = person(rng);
  const text = hiking
    ? `${eunNeun(who)} 같은 등산로로 산 정상까지 올라갔다가 내려왔다. 오를 때는 ${kmh(v1)}, 내려올 때는 ${kmh(v2)}로 걸었다면 전체 평균 속력은 시속 몇 km인가?`
    : rng.pick([
        `${eunNeun(who)} 집에서 회사까지 갈 때는 ${kmh(v1)}, 돌아올 때는 ${kmh(v2)}로 같은 길을 이동했다. 왕복 평균 속력은 시속 몇 km인가?`,
        `배송 차량 한 대가 물류센터에서 거래처까지 ${kmh(v1)}로 갔다가 같은 경로를 ${kmh(v2)}로 되돌아왔다. 왕복 전체의 평균 속력은 시속 몇 km인가?`,
      ]);
  return {
    text,
    answer: ans,
    wrongs: [
      { value: (v1 + v2) / 2, mistakeTag: '산술평균 착각' },
      { value: ans / 2, mistakeTag: '왕복 거리 누락' },
      { value: Math.max(v1, v2), mistakeTag: '한 구간만 반영' },
      { value: Math.min(v1, v2), mistakeTag: '한 구간만 반영' },
    ],
    format: (v) => `시속 ${num(v)}km`,
    near: nearBy(ans, hiking ? 0.5 : 2),
    steps: [
      `편도 거리를 d라 하면 왕복 거리는 2d예요.`,
      `걸린 시간은 d/${num(v1)} + d/${num(v2)}예요.`,
      `평균 속력 = 2d ÷ (d/${num(v1)} + d/${num(v2)}) = 2×${num(v1)}×${num(v2)} ÷ (${num(v1)}+${num(v2)}) = 시속 ${num(ans)}km`,
      `두 속력의 단순 평균(시속 ${num((v1 + v2) / 2)}km)은 함정이에요. 느린 구간에서 더 오래 머물기 때문이에요.`,
    ],
  };
}

function meet(rng: Rng): Generated {
  const walking = rng.chance(1 / 3);
  const a = walking ? rng.int(3, 6) : rng.pick([40, 50, 60, 70, 80, 90]);
  let b = walking ? rng.int(2, 6) : rng.pick([30, 40, 50, 60, 70, 80, 100]);
  if (a === b) b += walking ? 1 : 10;
  const t = walking ? rng.pick([0.5, 1, 1.5, 2]) : rng.pick([1, 1.5, 2, 2.5, 3]);
  const D = (a + b) * t;
  const ans = t * 60;
  const [p1, p2] = pair(rng);
  const text = walking
    ? `둘레가 ${num(D)}km인 호수 산책로의 한 지점에서 ${gwaWa(p1)} ${iGa(p2)} 서로 반대 방향으로 동시에 출발했다. ${eunNeun(p1)} ${kmh(a)}, ${eunNeun(p2)} ${kmh(b)}로 걸을 때 두 사람이 처음 만나는 것은 출발 후 몇 분 뒤인가?`
    : rng.pick([
        `두 지점 A, B 사이의 거리는 ${num(D)}km이다. ${eunNeun(p1)} A에서 B 방향으로 ${kmh(a)}, ${eunNeun(p2)} B에서 A 방향으로 ${kmh(b)}로 동시에 출발했다. 두 사람이 만나는 것은 출발 후 몇 분 뒤인가?`,
        `서로 ${num(D)}km 떨어진 두 사업소에서 차량 두 대가 상대 사업소를 향해 동시에 출발했다. 한 대는 ${kmh(a)}, 다른 한 대는 ${kmh(b)}로 달린다면 두 차량은 출발 후 몇 분 뒤에 만나는가?`,
      ]);
  const wrongs: Generated['wrongs'] = [
    { value: Math.round((D / a) * 60), mistakeTag: '한 구간만 반영' },
    { value: Math.round((D / b) * 60), mistakeTag: '한 구간만 반영' },
    { value: Math.round((D / Math.abs(a - b)) * 60), mistakeTag: '상대 속력 혼동' },
    { value: t, mistakeTag: '시간 단위 환산 오류' },
  ];
  if (!Number.isInteger(t)) wrongs.push({ value: round(t * 100), mistakeTag: '시간 단위 환산 오류' });
  return {
    text,
    answer: ans,
    wrongs,
    format: (v) => `${num(v)}분`,
    near: nearBy(ans, 10),
    steps: [
      `서로 반대 방향으로 움직이므로 1시간에 ${a} + ${b} = ${a + b}km씩 가까워져요.`,
      `만나는 시간 = ${num(D)} ÷ ${a + b} = ${num(t)}시간 = ${ans}분`,
      `한 사람의 속력만 쓰거나 속력의 차(${Math.abs(a - b)}km)를 쓰면 틀려요. 차는 같은 방향으로 따라갈 때 써요.`,
    ],
  };
}

export const speed: Template = {
  id: 'arith.speed',
  area: 'arith',
  subtype: '거리·속력·시간',
  difficulty: 2,
  generate: (rng) => (rng.chance(0.5) ? avgRound(rng) : meet(rng)),
};
