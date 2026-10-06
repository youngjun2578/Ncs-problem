/**
 * 심화 세트 구성. 기본 세트(server/engine/set.ts)와 같은 방식으로 문항을 만들되 고르는 규칙만 다르다.
 *  - 영역마다 서로 다른 유형 3개
 *  - 영역 안에 '기존 확장'과 '신규'가 모두 있으면 각각 1개 이상
 *  - 영역 안 순서는 난이도 오름차순
 *
 * 난수는 용도마다 따로 쓴다(server/advanced/seed.ts).
 *  - 템플릿 고르기: 세트 시드의 'pick' 하위 시드 하나로 네 영역을 차례로 고른다.
 *  - 문항 만들기: 자리(0~11)마다 'item:자리' 하위 시드로 새 난수를 만든다. 재시도도 그 난수만 쓴다.
 * 그래서 한 템플릿이 난수를 몇 번 쓰든 세트 구성과 다른 자리 문항은 바뀌지 않는다.
 */
import { Rng } from '../engine/rng.js';
import { makeProblem } from '../engine/set.js';
import type { AreaId, Problem, Template } from '../engine/types.js';
import { ADVANCED_KIND } from './registry.js';
import { PICK_LABEL, itemLabel, subSeed } from './seed.js';

/** 문항 하나를 만들 때 조건이 맞지 않으면 같은 난수로 다시 뽑는 최대 횟수 */
const ITEM_TRIES = 30;

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

/** 세트의 템플릿 구성(자리 순서대로). 'pick' 난수만 쓴다 */
export function planAdvancedSet(templates: Template[], seed: number, opts: { areas: AreaId[]; perArea: number }): Template[] {
  const rng = new Rng(subSeed(seed, PICK_LABEL));
  return opts.areas.flatMap((area) => pick(rng, templates.filter((t) => t.area === area), opts.perArea));
}

/**
 * 한 자리의 문항. 그 자리 전용 난수만 쓴다.
 * avoid: 세트 안 앞 문항의 문장(같은 문장이면 다시 뽑는다). 한 세트의 템플릿은 모두 다르므로 실제로는 겹치지 않는다.
 */
export function makeAdvancedItem(tpl: Template, seed: number, slot: number, avoid: ReadonlySet<string> = new Set()): Problem {
  const rng = new Rng(subSeed(seed, itemLabel(slot)));
  for (let tries = 0; tries < ITEM_TRIES; tries++) {
    try {
      const cand = makeProblem(tpl, rng);
      if (!avoid.has(cand.text)) return cand;
    } catch {
      // 숫자 조건이나 보기 구성이 맞지 않으면 다시 뽑는다. validate:advanced가 빈도를 감시한다.
    }
  }
  throw new Error(`심화 문항 생성 실패: ${tpl.id}`);
}

export function generateAdvancedSet(templates: Template[], seed: number, opts: { areas: AreaId[]; perArea: number }): Problem[] {
  const texts = new Set<string>();
  return planAdvancedSet(templates, seed, opts).map((tpl, slot) => {
    const p = makeAdvancedItem(tpl, seed, slot, texts);
    texts.add(p.text);
    return p;
  });
}
