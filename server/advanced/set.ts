/**
 * 심화 세트 구성. 기본 세트(server/engine/set.ts)와 같은 방식으로 문항을 만들되 고르는 규칙만 다르다.
 *  - 영역마다 서로 다른 유형 3개
 *  - 영역 안에 '기존 확장'과 '신규'가 모두 있으면 각각 1개 이상
 *  - 영역 안 순서는 난이도 오름차순
 */
import { Rng } from '../engine/rng.js';
import { makeProblem } from '../engine/set.js';
import type { AreaId, Problem, Template } from '../engine/types.js';
import { ADVANCED_KIND } from './registry.js';

function pick(rng: Rng, pool: Template[], n: number): Template[] {
  const shuffled = rng.shuffle(pool);
  const kinds = new Set(pool.map((t) => ADVANCED_KIND[t.id]));
  const chosen: Template[] = [];
  // 종류마다 하나씩 먼저
  for (const k of rng.shuffle([...kinds])) {
    const t = shuffled.find((x) => ADVANCED_KIND[x.id] === k && !chosen.includes(x));
    if (t && chosen.length < n) chosen.push(t);
  }
  for (const t of shuffled) {
    if (chosen.length >= n) break;
    if (!chosen.includes(t) && !chosen.some((c) => c.subtype === t.subtype)) chosen.push(t);
  }
  return chosen.sort((a, b) => a.difficulty - b.difficulty);
}

export function generateAdvancedSet(templates: Template[], seed: number, opts: { areas: AreaId[]; perArea: number }): Problem[] {
  const rng = new Rng(seed);
  const texts = new Set<string>();
  const out: Problem[] = [];
  for (const area of opts.areas) {
    const pool = templates.filter((t) => t.area === area);
    for (const tpl of pick(rng, pool, opts.perArea)) {
      let p: Problem | null = null;
      for (let tries = 0; tries < 30 && !p; tries++) {
        try {
          const cand = makeProblem(tpl, rng);
          if (!texts.has(cand.text)) p = cand;
        } catch {
          // 숫자 조건이나 보기 구성이 맞지 않으면 다시 뽑는다. validate:advanced가 빈도를 감시한다.
        }
      }
      if (!p) throw new Error(`심화 문항 생성 실패: ${tpl.id}`);
      texts.add(p.text);
      out.push(p);
    }
  }
  return out;
}
