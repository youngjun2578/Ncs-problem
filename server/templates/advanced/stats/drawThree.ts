/** 심화(기존 확장): 되돌려 놓지 않고 세 번 꺼낼 때 "정확히 2개" / "적어도 1개" 확률 */
import type { Template, Generated } from '../../../engine/types.js';
import { frac, fracLabel, isProb, C, type Frac } from '../../../engine/frac.js';
import { search, fracSteps } from '../util.js';
import { iGa, eulReul } from '../../common.js';

export const drawThree: Template<Frac> = {
  id: 'adv.stats.drawThree',
  area: 'stats',
  subtype: '비복원 세 번 꺼내기',
  difficulty: 3,
  generate(rng): Generated<Frac> {
    const [obj, c1, c2] = rng.pick([['공', '빨간', '파란'], ['카드', '노란', '흰'], ['제품', '정상', '불량']] as [string, string, string][]);
    const exactTwo = rng.chance(0.5);
    const p = search(rng, 2000, (r) => {
      const a = r.int(3, 7), b = r.int(3, 7), n = a + b;
      const all = C(n, 3);
      const ans = exactTwo ? frac(C(a, 2) * C(b, 1), all) : frac(all - C(b, 3), all);
      const raw = exactTwo
        ? [
            { value: frac(3 * a * a * b, n * n * n), mistakeTag: '복원·비복원 혼동' as const },
            { value: frac(a * (a - 1) * b, n * (n - 1) * (n - 2)), mistakeTag: '경우 누락' as const },
            { value: frac(C(a, 2) * C(b, 1) + C(a, 3), all), mistakeTag: '구하는 대상 혼동' as const },
            { value: frac(C(a, 2), C(n, 2)), mistakeTag: '조건 누락' as const },
            { value: frac(C(a, 2) * C(b, 1), n * (n - 1) * (n - 2)), mistakeTag: '전체 경우의 수 오류' as const },
          ]
        : [
            { value: frac(C(b, 3), all), mistakeTag: '구하는 대상 혼동' as const },
            { value: frac(n ** 3 - b ** 3, n ** 3), mistakeTag: '복원·비복원 혼동' as const },
            { value: frac(C(a, 1) * C(b, 2), all), mistakeTag: '여사건 미활용' as const },
            { value: frac(a, n), mistakeTag: '조건 누락' as const },
            { value: frac(Math.min(3 * a, n), n), mistakeTag: '여사건 미활용' as const },
          ];
      const labels = new Set([fracLabel(ans)]);
      const wrongs = raw.filter((w) => isProb(w.value) && !labels.has(fracLabel(w.value)) && labels.add(fracLabel(w.value)));
      if (wrongs.length < 4 || !isProb(ans)) return null;
      return { a, b, n, ans, wrongs };
    });
    const { a, b, n, ans, wrongs } = p;
    const ask = exactTwo ? `${c1} ${iGa(obj)} 정확히 2개일 확률은?` : `${c1} ${iGa(obj)} 적어도 1개 나올 확률은?`;
    // 문장마다 꺼내는 방식이 다르다: 하나씩 차례로(순서 있음) / 동시에·한 번에(조합)
    const { text, sequential } = rng.pick([
      { text: `${c1} ${obj} ${a}개와 ${c2} ${obj} ${b}개가 들어 있는 상자에서 ${eulReul(obj)} 하나씩 3번 꺼낸다. 꺼낸 것은 되돌려 놓지 않을 때, ${ask}`, sequential: true },
      { text: `${c1} ${obj} ${a}개, ${c2} ${obj} ${b}개 중에서 동시에 3개를 꺼낼 때, ${ask}`, sequential: false },
      { text: `상자에 ${c1} ${obj} ${a}개와 ${c2} ${obj} ${b}개가 섞여 있다. 한 번에 3개를 고를 때 ${ask}`, sequential: false },
    ]);
    const all = C(n, 3);
    const seqAll = n * (n - 1) * (n - 2);
    const steps = sequential
      ? exactTwo
        ? [
            `${c1} 2개와 ${c2} 1개가 나오는 순서 하나(${c1} → ${c1} → ${c2})의 확률: ${a}/${n} × ${a - 1}/${n - 1} × ${b}/${n - 2} = ${a * (a - 1) * b}/${seqAll}`,
            `${c2} ${iGa(obj)} 첫째·둘째·셋째 중 언제 나와도 확률이 같으므로, 순서는 3가지예요.`,
            `확률 = 3 × ${a * (a - 1) * b}/${seqAll} = ${fracSteps(3 * a * (a - 1) * b, seqAll)}`,
            `하나씩 차례로 꺼낼 때는 순서가 다른 세 경우를 모두 더해야 해요. 한 가지 순서만 계산하면 나머지 두 경우를 빠뜨려요.`,
          ]
        : [
            `반대 경우(${c1} ${obj} 0개 = 세 번 모두 ${c2}): ${b}/${n} × ${b - 1}/${n - 1} × ${b - 2}/${n - 2} = ${fracSteps(b * (b - 1) * (b - 2), seqAll)}`,
            `확률 = 1 − ${fracLabel(frac(b * (b - 1) * (b - 2), seqAll))} = ${fracLabel(ans)}`,
          ]
      : exactTwo
        ? [
            `전체: ${n}개 중 3개 = ${n}C3 = ${all}`,
            `${c1} 2개와 ${c2} 1개: ${a}C2 × ${b}C1 = ${C(a, 2)} × ${b} = ${C(a, 2) * b}`,
            `확률 = ${fracSteps(C(a, 2) * b, all)}`,
            `동시에 꺼내므로 조합으로 세면 되고, 꺼낸 순서를 따로 나눠 셀 필요가 없어요.`,
          ]
        : [
            `반대 경우(${c1} ${obj} 0개 = 모두 ${c2}): ${b}C3 = ${C(b, 3)}`,
            `전체: ${n}C3 = ${all}`,
            `확률 = 1 − ${C(b, 3)}/${all} = ${fracLabel(ans)}`,
          ];
    return {
      text,
      answer: ans,
      wrongs,
      format: fracLabel,
      steps,
    };
  },
};
