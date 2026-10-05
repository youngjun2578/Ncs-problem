/** 템플릿별 예시 출력: npx tsx scripts/sample.ts [템플릿id 접두어] [개수] */
import { TEMPLATES } from '../server/registry.js';
import { Rng } from '../server/engine/rng.js';
import { makeProblem } from '../server/engine/set.js';

const [prefix = '', count = '2'] = process.argv.slice(2);
for (const t of TEMPLATES.filter((t) => t.id.startsWith(prefix))) {
  for (let i = 0; i < Number(count); i++) {
    const p = makeProblem(t, new Rng(Date.now() + i * 101));
    console.log(`\n[${t.id}] ${p.text}`);
    if (p.figure) console.log('  (도표)', JSON.stringify(p.figure.kind === 'chart' ? p.figure.spec : p.figure.table));
    p.choices.forEach((c, k) => console.log(`  ${k === p.answerIndex ? '*' : ' '} ${c.label}${c.mistakeTag ? `  ← ${c.mistakeTag}` : ''}`));
    p.steps.forEach((s) => console.log('    · ' + s));
  }
}
