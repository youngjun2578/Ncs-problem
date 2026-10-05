/**
 * 본문(예제 밖)에 적은 숫자 검산. 글에 아래 문장이 그대로 있어야 하고, 계산이 맞아야 한다.
 * 예제의 정답과 중간 숫자는 examples.ts가 따로 검산한다.
 */
import { buildExample } from './examples.js';

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const reduce = (n: number, d: number) => `${n / gcd(n, d)}/${d / gcd(n, d)}`;
const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const exampleHas = (id: string, seed: number, ...parts: string[]) => {
  const t = buildExample(id, seed).problem.text;
  return parts.every((p) => t.includes(p));
};

export const CLAIMS: { slug: string; text: string; ok: () => boolean }[] = [
  // 속력: 표와 확인 문장은 예제 1(시드 101: 시속 36km, 45km)의 값
  { slug: 'speed-round-trip-average', text: '| 갈 때 | 180km | 시속 36km | 5시간 |', ok: () => 180 / 36 === 5 && exampleHas('arith.speed', 101, '시속 36km', '시속 45km') },
  { slug: 'speed-round-trip-average', text: '| 올 때 | 180km | 시속 45km | 4시간 |', ok: () => 180 / 45 === 4 },
  { slug: 'speed-round-trip-average', text: '| 전체 | 360km | ? | 9시간 |', ok: () => 180 * 2 === 360 && 5 + 4 === 9 },
  { slug: 'speed-round-trip-average', text: '시속 40km로 360km를 가면 9시간', ok: () => 360 / 40 === 9 && close((2 * 36 * 45) / (36 + 45), 40) },
  // 농도: 예제 1(시드 100: 3% 400g, 15% 200g), 예제 3(시드 101: 18% 550g, 물 100g 증발)
  { slug: 'concentration-mix-water-evaporation', text: '| 첫 번째 | 400g | 3% | 12g |', ok: () => (400 * 3) / 100 === 12 && exampleHas('arith.concentration', 100, '3%의 소금물 400g', '15%의 소금물 200g') },
  { slug: 'concentration-mix-water-evaporation', text: '| 두 번째 | 200g | 15% | 30g |', ok: () => (200 * 15) / 100 === 30 },
  { slug: 'concentration-mix-water-evaporation', text: '| 섞은 뒤 | 600g | ? | 42g |', ok: () => 400 + 200 === 600 && 12 + 30 === 42 },
  { slug: 'concentration-mix-water-evaporation', text: '3%와 15%의 가운데인 9%보다 낮은 7%', ok: () => (3 + 15) / 2 === 9 && close((42 / 600) * 100, 7) },
  { slug: 'concentration-mix-water-evaporation', text: '450g의 22%를 구하면 처음 소금의 양', ok: () => close(450 * 0.22, (550 * 18) / 100) && exampleHas('arith.concentration', 101, '18%의 소금물 550g', '물 100g') },
  // 일의 양: 본문 설명, 예제 3(시드 104: 20일, 30일, 함께 3일)
  { slug: 'work-rate-one-unit', text: '혼자 12일과 36일 걸리는 일이라면 전체를 36칸으로 보고, 하루에 3칸과 1칸', ok: () => 36 / 12 === 3 && 36 / 36 === 1 },
  { slug: 'work-rate-one-unit', text: '20과 30의 최소공배수인 60칸', ok: () => (20 * 30) / gcd(20, 30) === 60 && exampleHas('arith.work', 104, '20일', '30일', '처음 3일') },
  { slug: 'work-rate-one-unit', text: '| 함께 | 3 + 2 = 5 | 3일 | 15 |', ok: () => 60 / 20 === 3 && 60 / 30 === 2 && 3 * 5 === 15 },
  { slug: 'work-rate-one-unit', text: '| 혼자 | 3 | ? | 45 |', ok: () => 60 - 15 === 45 },
  { slug: 'work-rate-one-unit', text: '남은 45칸을 하루 3칸씩 하면 15일', ok: () => 45 / 3 === 15 },
  { slug: 'work-rate-one-unit', text: '함께 한 3일과 혼자 한 15일', ok: () => 3 * 5 + 15 * 3 === 60 },
  // 증가율
  { slug: 'growth-rate-change', text: '140%가 되었다면 늘어난 비율은 40%', ok: () => 140 - 100 === 40 },
  { slug: 'growth-rate-change', text: '600 ÷ 1.2 = 500', ok: () => close(600 / 1.2, 500) && close(500 * 1.2, 600) },
  { slug: 'growth-rate-change', text: '20%를 빼서 480', ok: () => close(600 * 0.8, 480) },
  { slug: 'growth-rate-change', text: '25% 오른 뒤 4% 내린 것을 21% 상승', ok: () => 25 - 4 === 21 && close(1.25 * 0.96, 1.2) },
  // %p
  { slug: 'percent-point-share', text: '20%에서 30%로 바뀌었다면 차이는 10%p이고, 처음보다 50% 늘어난', ok: () => 30 - 20 === 10 && (10 / 20) * 100 === 50 },
  // %p의 범위: 0~100% 비율끼리의 차이는 100%p 이하(20%→50%의 30%p도 이 범위 안)
  { slug: 'percent-point-share', text: '%p는 0%에서 100% 사이에 있는 두 비율의 차이이므로 100%p를 넘을 수 없습니다', ok: () => 100 - 0 === 100 && 50 - 20 === 30 && 30 <= 100 },
  // 순열·조합
  { slug: 'permutation-combination', text: '4명이라면 한 줄은 24가지, 원형은 24 ÷ 4 = 6가지', ok: () => 4 * 3 * 2 * 1 === 24 && 24 / 4 === 6 && 3 * 2 * 1 === 6 },
  // 확률
  { slug: 'probability-fraction', text: '| 6/28 | 2 | 3/14 |', ok: () => gcd(6, 28) === 2 && reduce(6, 28) === '3/14' },
  { slug: 'probability-fraction', text: '| 6/36 | 6 | 1/6 |', ok: () => gcd(6, 36) === 6 && reduce(6, 36) === '1/6' },
  { slug: 'probability-fraction', text: '| 91/216 | 없음 | 91/216 |', ok: () => gcd(91, 216) === 1 },
  { slug: 'probability-fraction', text: '4/8 × 3/7 = 3/14', ok: () => reduce(4 * 3, 8 * 7) === '3/14' && exampleHas('stats.probability', 100, '정상 제품 4개', '불량 제품 4개') },
  { slug: 'probability-fraction', text: '4/8 × 4/8 = 1/4', ok: () => reduce(4 * 4, 8 * 8) === '1/4' },
  { slug: 'probability-fraction', text: '전체 8가지에서 빼서 7/8', ok: () => 2 ** 3 === 8 && reduce(8 - 1, 8) === '7/8' },
  { slug: 'probability-fraction', text: '91/216과 125/216을 더해 1', ok: () => 91 + 125 === 216 && 5 ** 3 === 125 && 6 ** 3 === 216 },
  { slug: 'speed-round-trip-average', text: '40과 60의 가운데 값인 50', ok: () => (40 + 60) / 2 === 50 },
  { slug: 'speed-round-trip-average', text: '편도 거리를 120km로 정해 보면, 갈 때는 3시간, 올 때는 2시간', ok: () => 120 / 40 === 3 && 120 / 60 === 2 },
  { slug: 'speed-round-trip-average', text: '왕복 240km를 5시간에 달린 셈이라 평균 속력은 시속 48km', ok: () => 120 * 2 === 240 && 3 + 2 === 5 && 240 / 5 === 48 && (2 * 40 * 60) / (40 + 60) === 48 },
  { slug: 'speed-round-trip-average', text: '가운데 값 50보다 느린 쪽', ok: () => 48 < 50 && 48 - 40 < 60 - 48 },
  { slug: 'permutation-combination', text: '3 × 2 × 1가지씩', ok: () => 3 * 2 * 1 === 6 },
];
