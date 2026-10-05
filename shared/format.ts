/** 숫자 표기: 천 단위 쉼표, 소수는 최대 2자리. 서버(문제 생성)와 브라우저(도표 그리기)가 함께 쓴다. */
const NF = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 });
export function num(n: number): string {
  return NF.format(Math.round(n * 100) / 100);
}
