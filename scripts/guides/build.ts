/**
 * 가이드 글 빌드: content/guides/*.md → guide/index.html, guide/<slug>/index.html (생성 파일, 커밋하지 않음)
 * vite.config.ts가 dev·build 시작 때 부른다. 만들어진 HTML은 다른 페이지처럼 Vite가 처리한다(머리말·꼬리말, CSS).
 *
 *  - status: draft  → 개발 서버에서만 만든다(“초안” 표시, noindex). 운영 빌드에는 HTML·목록·sitemap 모두 없음
 *  - status: published → 운영 빌드에 포함, 메타·OG·JSON-LD·sitemap·목록
 *  - 예제: 본문의 <!-- example: 템플릿id 시드 --> 줄을 엔진 문제 + 직접 계산한 풀이로 바꾼다(examples.ts에서 검산)
 *  - 내용 검사: 리포트용 문구·템플릿 이름·이용권 관련 낱말이 들어가면 빌드를 멈춘다
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { marked } from 'marked';
import { buildExample, type Example } from './examples.js';
import { CLAIMS } from './claims.js';
import { renderChart, renderFigure } from '../../shared/charts/render.js';
import { MISTAKES } from '../../server/engine/mistakes.js';
import { AREAS } from '../../server/areas.js';
import { TEMPLATES } from '../../server/registry.js';
import { generateQuestions } from '../../server/diagnosis.js';

export const CONTENT_DIR = 'content/guides';
/** 생성 HTML을 두는 곳(프로젝트 루트 기준). .gitignore에 있음 */
export const OUT_DIR = 'guide';

const AREA_NAMES = ['기초연산', '기초통계', '도표분석', '도표작성', '종합'] as const;
const CIRC = '①②③④⑤';
const SITE = 'NCS 수리능력 진단';

export interface Guide {
  slug: string;
  title: string;
  description: string;
  area: (typeof AREA_NAMES)[number];
  status: 'draft' | 'published';
  updated: string;
  related: string[];
  body: string;
  file: string;
}

export interface GuideStat {
  slug: string;
  title: string;
  status: string;
  hangul: number;
  chars: number;
  h1: number;
  examples: { templateId: string; seed: number; answer: string }[];
}

export interface GuideBuild {
  /** 생성한 HTML (rollup input 이름 → 파일 경로) */
  pages: Record<string, string>;
  /** 이번 빌드에서 보이는 글(sitemap·링크용) */
  visible: { slug: string; updated: string; draft: boolean }[];
  stats: GuideStat[];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ---------- 머리글(frontmatter): key: value, related는 [a, b] 형식 ---------- */

export function parseGuide(file: string, text: string): Guide {
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: 머리글(---)이 없습니다`);
  const meta: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim().replace(/^"(.*)"$/, '$1');
  }
  const related = (meta.related ?? '').replace(/^\[|\]$/g, '').split(',').map((s) => s.trim()).filter(Boolean);
  const g: Guide = {
    slug: meta.slug,
    title: meta.title,
    description: meta.description,
    area: meta.area as Guide['area'],
    status: meta.status as Guide['status'],
    updated: meta.updated,
    related,
    body: m[2],
    file,
  };
  const bad = (msg: string) => {
    throw new Error(`${file}: ${msg}`);
  };
  if (!/^[a-z0-9-]+$/.test(g.slug ?? '')) bad('slug는 영문 소문자·숫자·하이픈만');
  if (!file.endsWith(`/${g.slug}.md`)) bad('파일 이름과 slug가 다릅니다');
  if (!g.title) bad('title이 없습니다');
  if (!g.description) bad('description이 없습니다');
  if (!AREA_NAMES.includes(g.area)) bad(`area는 ${AREA_NAMES.join('/')} 중 하나`);
  if (g.status !== 'draft' && g.status !== 'published') bad('status는 draft 또는 published');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(g.updated ?? '')) bad('updated는 YYYY-MM-DD');
  if (/^#\s/m.test(g.body)) bad('본문에 # 제목(h1)을 쓰지 않습니다. 제목은 title로 한 번만 나옵니다');
  return g;
}

export function loadGuides(root = '.'): Guide[] {
  const dir = resolve(root, CONTENT_DIR);
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  const guides = files.map((f) => parseGuide(`${CONTENT_DIR}/${f}`, readFileSync(join(dir, f), 'utf8')));
  const slugs = new Set(guides.map((g) => g.slug));
  for (const g of guides) for (const r of g.related) if (!slugs.has(r)) throw new Error(`${g.file}: related에 없는 글 ${r}`);
  // 관련 글은 서로 링크한다(A가 B를 가리키면 B도 A를 가리킨다)
  for (const g of guides)
    for (const r of g.related)
      if (!guides.find((x) => x.slug === r)!.related.includes(g.slug)) throw new Error(`${g.file}: 관련 글 ${r}도 이 글(${g.slug})을 related에 넣어야 합니다`);
  for (const g of guides) if (g.related.length < 2 || g.related.length > 3) throw new Error(`${g.file}: 관련 글은 2~3개`);
  const dupTitle = guides.find((g, i) => guides.findIndex((x) => x.title === g.title) !== i);
  if (dupTitle) throw new Error(`제목 중복: ${dupTitle.title}`);
  const dupDesc = guides.find((g, i) => guides.findIndex((x) => x.description === g.description) !== i);
  if (dupDesc) throw new Error(`description 중복: ${dupDesc.slug}`);
  return guides;
}

/* ---------- 내용 검사 ---------- */

/** scripts/check-bundle.ts와 같은 시드로 만든 진단 문항의 문제·해설 문장 */
const BUNDLE_CHECK_SEEDS = [1, 2, 3, 12345, 987654321];
let needleCache: string[] | null = null;
function bundleNeedles(): string[] {
  needleCache ??= [...new Set(BUNDLE_CHECK_SEEDS.flatMap((s) => generateQuestions(s).flatMap((q) => [q.text, ...q.steps])))].filter((n) => n.length >= 4);
  return needleCache;
}

/** 가이드에 들어가면 안 되는 문구: 결과 리포트의 틀린 패턴 문구·영역 설명(별도 기능의 내용), 템플릿 이름, 이용권 이야기 */
function lint(g: Guide, html: string) {
  const text = html.replace(/<[^>]+>/g, ' ');
  const problems: string[] = [];
  for (const [tag, msg] of Object.entries(MISTAKES)) {
    if (tag.length >= 4 && text.includes(tag)) problems.push(`리포트 틀린 패턴 이름 "${tag}"`);
    if (text.includes(msg)) problems.push(`리포트 틀린 패턴 문장 "${msg.slice(0, 20)}…"`);
  }
  for (const a of AREAS) if (text.includes(a.description)) problems.push(`영역 설명 문장(${a.name})`);
  for (const t of TEMPLATES) if (html.includes(t.id)) problems.push(`템플릿 id ${t.id}`);
  for (const w of ['이용권', '결제', '로그인', '유료', '구독']) if (text.includes(w)) problems.push(`낱말 "${w}"`);
  // 번들 검사(scripts/check-bundle.ts)가 찾는 문제·해설 문장과 겹치면 안 된다. 같은 시드 목록을 쓴다.
  for (const n of bundleNeedles()) if (text.includes(n)) problems.push(`번들 검사 문장과 겹침 "${n.slice(0, 30)}…" (다른 시드의 예제로 바꾸세요)`);
  for (const w of ['합격률', '출제 비율', '출제 경향', '시험 시간']) if (text.includes(w)) problems.push(`외부 사실처럼 보이는 표현 "${w}"`);
  // 본문 숫자 검산: 목록의 문장이 글에 그대로 있고 계산이 맞아야 한다
  for (const c of CLAIMS.filter((c) => c.slug === g.slug)) {
    if (!g.body.includes(c.text)) problems.push(`검산 목록의 문장이 본문에 없음: "${c.text}"`);
    else if (!c.ok()) problems.push(`본문 숫자 검산 실패: "${c.text}"`);
  }
  if (problems.length) throw new Error(`${g.file}: 내용 검사 실패\n - ${problems.join('\n - ')}`);
}

/** 이번 빌드에 없는 가이드로 가는 링크가 있으면 멈춘다(발행 글이 초안 글을 가리키는 경우 등) */
function checkLinks(g: Guide, html: string, visible: Map<string, Guide>) {
  for (const m of html.matchAll(/href="\/guide\/([^"/]*)\/?"/g)) {
    const slug = m[1];
    if (slug && !visible.has(slug)) throw new Error(`${g.file}: 이번 빌드에 없는 가이드로 링크합니다 → /guide/${slug}/ (그 글도 발행하거나 링크를 빼야 합니다)`);
  }
}

/* ---------- 예제 ---------- */

function exampleHtml(e: Example, n: number): string {
  const p = e.problem;
  const isChart = p.choices.some((c) => c.chart);
  const choices = p.choices
    .map((c, k) =>
      isChart
        ? `<li><span class="ex-mark" aria-hidden="true">${CIRC[k]}</span><span class="sr-only">${k + 1}번</span><span class="ex-chart">${renderChart(c.chart!, { w: 240, h: 140 })}</span></li>`
        : `<li><span class="ex-mark" aria-hidden="true">${CIRC[k]}</span><span class="sr-only">${k + 1}번</span> ${esc(c.label)}</li>`,
    )
    .join('');
  return [
    `<div class="guide-example" id="example-${n}">`,
    `<p class="ex-label">예제 ${n}</p>`,
    `<p class="ex-q">${esc(p.text)}</p>`,
    p.figure ? renderFigure(p.figure) : '',
    `<ol class="ex-choices${isChart ? ' ex-chart-choices' : ''}" aria-label="보기">${choices}</ol>`,
    `<p class="ex-sub">풀이</p>`,
    `<ol class="ex-steps">${e.solved.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`,
    `<p class="ex-answer"><b>정답</b> ${CIRC[p.answerIndex]} ${esc(e.solved.answer)}</p>`,
    `</div>`,
  ].join('');
}

const EXAMPLE_LINE = /^<!--\s*example:\s*([\w.]+)\s+(\d+)\s*-->$/gm;

function renderBody(g: Guide): { html: string; examples: Example[] } {
  const examples: Example[] = [];
  const md = g.body.replace(EXAMPLE_LINE, (_, id: string, seed: string) => {
    const e = buildExample(id, Number(seed));
    examples.push(e);
    // 앞뒤 빈 줄: 마크다운이 HTML 덩어리로 그대로 둔다
    return `\n${exampleHtml(e, examples.length)}\n`;
  });
  let html = marked.parse(md, { async: false, gfm: true }) as string;
  // 표는 좁은 화면에서 넘치지 않도록 감싼다
  html = html.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>');
  return { html, examples };
}

/* ---------- 페이지 ---------- */

function head(o: { title: string; description: string; path: string; type: string; jsonld: unknown[]; noindex: boolean }) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
${o.noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="%VITE_SITE_URL%${o.path}">`}
<meta name="theme-color" content="#1b2f55" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0f1623" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta property="og:type" content="${o.type}">
<meta property="og:locale" content="ko_KR">
<meta property="og:site_name" content="${SITE}">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.description)}">
<meta property="og:url" content="%VITE_SITE_URL%${o.path}">
<meta property="og:image" content="%VITE_SITE_URL%/og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="/src/styles/main.css">
<link rel="stylesheet" href="/src/styles/guide.css">
${o.jsonld.map((j) => `<script type="application/ld+json">\n${JSON.stringify(j).replace(/</g, '\\u003c')}\n</script>`).join('\n')}
</head>
<body>
<!--#masthead-->`;
}

const crumbs = (items: [string, string][]) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `%VITE_SITE_URL%${path}` })),
});

/** 머리말 로그인/내 계정 버튼(다른 페이지와 같은 진입점). 이용권 기능이 꺼진 빌드에서는 빌드 분기가 통째로 지운다 */
const LOGIN_SCRIPT = '<!--#if monetization-->\n<script type="module" src="/src/ui/site.ts"></script><!--#endif-->';
const DRAFT_BADGE = '<p class="draft-badge">초안 · 개발 서버에서만 보이며 운영 빌드에는 포함되지 않습니다.</p>';
const SOURCE_NOTE = '이 글의 예제는 이 사이트가 직접 만든 문제 생성 규칙으로 만든 연습용 문제이며, 실제 채용 시험 문제가 아닙니다.';

function articlePage(g: Guide, html: string, visible: Map<string, Guide>): string {
  const path = `/guide/${g.slug}/`;
  const draft = g.status === 'draft';
  const related = g.related.filter((r) => visible.has(r)).map((r) => visible.get(r)!);
  const article = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: g.title,
    description: g.description,
    inLanguage: 'ko',
    datePublished: g.updated,
    dateModified: g.updated,
    mainEntityOfPage: `%VITE_SITE_URL%${path}`,
    image: '%VITE_SITE_URL%/og.png',
    author: { '@type': 'Organization', name: SITE },
    publisher: { '@type': 'Organization', name: SITE },
  };
  return `${head({ title: `${g.title} · ${SITE}`, description: g.description, path, type: 'article', jsonld: [article, crumbs([['홈', '/'], ['유형별 풀이 가이드', '/guide/'], [g.title, path]])], noindex: draft })}
<main class="page prose guide" id="main">
  <nav class="crumbs" aria-label="현재 위치"><a href="/">홈</a> › <a href="/guide/">유형별 풀이 가이드</a></nav>
  ${draft ? DRAFT_BADGE : ''}
  <p class="eyebrow">${esc(g.area)} 풀이 가이드</p>
  <h1 class="title">${esc(g.title)}</h1>
  <p class="lead">${esc(g.description)}</p>
  <p class="guide-meta"><time datetime="${g.updated}">${g.updated.replace(/-/g, '.')}</time> 업데이트</p>
${html}
  <section class="practice" aria-labelledby="h-practice">
    <h2 id="h-practice">이 유형 직접 풀어 보기</h2>
    <p>진단은 4개 영역에서 3문항씩 모두 12문항이며, 영역마다 여러 유형 가운데 일부가 나옵니다. 그래서 이 글의 유형이 매번 나오지는 않지만, 풀 때마다 숫자와 문장이 새로 만들어집니다.</p>
    <p><a class="btn-primary" href="/diagnosis/">진단 시작</a></p>
  </section>
  ${
    related.length
      ? `<section class="related" aria-labelledby="h-related">
    <h2 id="h-related">관련 글</h2>
    <ul>${related.map((r) => `<li><a href="/guide/${r.slug}/">${esc(r.title)}</a></li>`).join('')}</ul>
  </section>`
      : ''
  }
  <p class="source-note">${SOURCE_NOTE}</p>
</main>
<!--#footer-->${LOGIN_SCRIPT}
</body>
</html>
`;
}

function indexPage(list: Guide[], dev: boolean): string {
  const order = [...AREA_NAMES.slice(4), ...AREA_NAMES.slice(0, 4)];
  const groups = order
    .map((area) => [area, list.filter((g) => g.area === area)] as const)
    .filter(([, gs]) => gs.length)
    .map(
      ([area, gs]) => `
  <section aria-labelledby="h-${AREA_NAMES.indexOf(area)}">
    <h2 id="h-${AREA_NAMES.indexOf(area)}">${area}</h2>
    <ul class="guide-list">${gs
      .map(
        (g) =>
          `<li><a href="/guide/${g.slug}/">${esc(g.title)}</a>${g.status === 'draft' ? ' <span class="draft-tag">초안</span>' : ''}<p>${esc(g.description)}</p></li>`,
      )
      .join('')}</ul>
  </section>`,
    )
    .join('');
  const description = '기초연산·기초통계·도표분석·도표작성 유형별로 풀이 순서, 예제, 자주 하는 실수와 확인하는 습관을 정리한 NCS 수리능력 풀이 가이드입니다.';
  return `${head({
    title: `유형별 풀이 가이드 · ${SITE}`,
    description,
    path: '/guide/',
    type: 'website',
    jsonld: [crumbs([['홈', '/'], ['유형별 풀이 가이드', '/guide/']])],
    noindex: list.every((g) => g.status === 'draft'),
  })}
<main class="page prose guide" id="main">
  <nav class="crumbs" aria-label="현재 위치"><a href="/">홈</a></nav>
  ${dev && list.some((g) => g.status === 'draft') ? DRAFT_BADGE.replace('초안 · ', '초안 포함 · ') : ''}
  <p class="eyebrow">NCS 수리능력</p>
  <h1 class="title">유형별 풀이 가이드</h1>
  <p class="lead">${description}</p>
${groups}
  <p class="source-note">${SOURCE_NOTE.replace('이 글의', '가이드의')}</p>
</main>
<!--#footer-->${LOGIN_SCRIPT}
</body>
</html>
`;
}

const hangulCount = (s: string) => (s.match(/[가-힣]/g) ?? []).length;

/**
 * 가이드 HTML을 생성한다.
 * includeDrafts: 개발 서버면 true(초안도 보임), 운영 빌드면 false
 */
export function writeGuides(opts: { root?: string; includeDrafts: boolean }): GuideBuild {
  const root = opts.root ?? '.';
  const all = loadGuides(root);
  const shown = all.filter((g) => opts.includeDrafts || g.status === 'published');
  const visible = new Map(shown.map((g) => [g.slug, g]));
  const out = resolve(root, OUT_DIR);
  rmSync(out, { recursive: true, force: true });
  const pages: Record<string, string> = {};
  const stats: GuideStat[] = [];
  for (const g of all) {
    // 초안도 예제 검산·내용 검사는 항상 한다(발행 전에 문제를 찾도록)
    const { html, examples } = renderBody(g);
    lint(g, html);
    const page = articlePage(g, html, visible);
    const mainText = page.slice(page.indexOf('<main'), page.indexOf('</main>')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    stats.push({
      slug: g.slug,
      title: g.title,
      status: g.status,
      hangul: hangulCount(mainText),
      chars: mainText.replace(/\s/g, '').length,
      h1: (page.match(/<h1[\s>]/g) ?? []).length,
      examples: examples.map((e) => ({ templateId: e.templateId, seed: e.seed, answer: e.solved.answer })),
    });
    if (!visible.has(g.slug)) continue;
    checkLinks(g, page, visible);
    mkdirSync(join(out, g.slug), { recursive: true });
    writeFileSync(join(out, g.slug, 'index.html'), page);
    pages[`guide-${g.slug}`] = join(out, g.slug, 'index.html');
  }
  if (shown.length) {
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'index.html'), indexPage(shown, opts.includeDrafts));
    pages.guide = join(out, 'index.html');
  }
  return {
    pages,
    visible: shown.map((g) => ({ slug: g.slug, updated: g.updated, draft: g.status === 'draft' })),
    stats,
  };
}

// 단독 실행: npx tsx scripts/guides/build.ts [--drafts]  → 생성 + 글별 통계 출력
if (process.argv[1]?.endsWith('build.ts')) {
  const r = writeGuides({ includeDrafts: process.argv.includes('--drafts') });
  console.table(r.stats.map((s) => ({ slug: s.slug, status: s.status, 한글: s.hangul, 글자: s.chars, h1: s.h1, 예제: s.examples.length })));
  console.log(`생성한 페이지 ${Object.keys(r.pages).length}개`);
}
