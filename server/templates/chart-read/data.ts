import type { Rng } from '../../engine/rng.js';

export const METRICS = [
  { what: '매출액', unit: '억 원', who: 'A 기업' },
  { what: '신규 가입자 수', unit: '천 명', who: 'B 서비스' },
  { what: '수출액', unit: '백만 달러', who: 'C 지역' },
  { what: '방문객 수', unit: '천 명', who: 'D 박물관' },
  { what: '에너지 사용량', unit: '천 TOE', who: 'E 공단' },
];

export function years(rng: Rng, n: number): string[] {
  const start = rng.int(2018, 2021);
  return Array.from({ length: n }, (_, i) => String(start + i));
}

export const CATS = [
  ['가', '나', '다', '라', '마'],
  ['A', 'B', 'C', 'D', 'E'],
  ['갑', '을', '병', '정', '무'],
];
export const catNames = (rng: Rng, n: number, suffix: string) => rng.pick(CATS).slice(0, n).map((c) => c + suffix);
