import { Rng } from './rng.js';
import { buildChoices } from './choices.js';
import type { AreaId, Problem, Template } from './types.js';

export function makeProblem(tpl: Template, rng: Rng): Problem {
  const g = tpl.generate(rng);
  const { choices, answerIndex, fillers } = buildChoices(rng, g);
  return {
    templateId: tpl.id,
    area: tpl.area,
    subtype: tpl.subtype,
    difficulty: tpl.difficulty,
    text: g.text,
    figure: g.figure,
    choices,
    answerIndex,
    steps: g.steps,
    fillers,
  };
}

/** 영역 안에서 서로 다른 유형 n개를 고른다. 가능하면 난이도 1·2·3을 하나씩. */
function pickTemplates(rng: Rng, pool: Template[], n: number): Template[] {
  const shuffled = rng.shuffle(pool);
  const chosen: Template[] = [];
  const used = new Set<string>();
  for (const d of rng.shuffle([1, 2, 3])) {
    const t = shuffled.find((x) => x.difficulty === d && !used.has(x.subtype));
    if (t && chosen.length < n) {
      chosen.push(t);
      used.add(t.subtype);
    }
  }
  for (const t of shuffled) {
    if (chosen.length >= n) break;
    if (!used.has(t.subtype)) {
      chosen.push(t);
      used.add(t.subtype);
    }
  }
  return chosen.sort((a, b) => a.difficulty - b.difficulty);
}

export interface SetOptions {
  areas: AreaId[];
  perArea: number;
}

/** 영역 순서대로 영역당 perArea 문항. 같은 세트 안에서 문장이 겹치지 않게 한다. */
export function generateSet(templates: Template[], seed: number, opts: SetOptions): Problem[] {
  const rng = new Rng(seed);
  const texts = new Set<string>();
  const out: Problem[] = [];
  for (const area of opts.areas) {
    const pool = templates.filter((t) => t.area === area);
    for (const tpl of pickTemplates(rng, pool, opts.perArea)) {
      let p: Problem | null = null;
      for (let tries = 0; tries < 30 && !p; tries++) {
        try {
          const cand = makeProblem(tpl, rng);
          if (!texts.has(cand.text)) p = cand;
        } catch {
          // 드물게 보기 구성이 안 되는 조합은 다시 뽑는다. validate가 빈도를 감시한다.
        }
      }
      if (!p) throw new Error(`문항 생성 실패: ${tpl.id}`);
      texts.add(p.text);
      out.push(p);
    }
  }
  return out;
}
