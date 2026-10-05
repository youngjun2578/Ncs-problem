/**
 * 가이드 빌드 결과 점검: 빌드한 dist를 읽어 확인한다.
 *   DIST=dist npx tsx scripts/guides/check-dist.ts      (문제가 있으면 exit 1)
 *
 *  - 원고의 status와 dist가 맞는지: published만 HTML·목록·sitemap에 있고, draft는 어디에도 없음
 *  - 발행 글: title·description·canonical·OG·JSON-LD(Article, BreadcrumbList), h1 하나
 *  - 내부 링크(/로 시작) 모두 dist에 있는지, 관련 글 링크가 발행 글만 가리키고 서로 링크하는지
 *  - 발행 글이 있을 때만 메인 하단·꼬리말에 /guide/ 링크
 *  - title·description 중복 없음
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadGuides } from './build.js';

const DIST = process.env.DIST ?? 'dist';
const problems: string[] = [];
const bad = (m: string) => problems.push(m);
const read = (p: string) => readFileSync(join(DIST, p), 'utf8');

const guides = loadGuides('.');
const pub = guides.filter((g) => g.status === 'published');
const draft = guides.filter((g) => g.status === 'draft');
const sitemap = read('sitemap.xml');

for (const g of draft) {
  if (existsSync(join(DIST, 'guide', g.slug))) bad(`초안 ${g.slug}의 HTML이 dist에 있음`);
  if (sitemap.includes(`/guide/${g.slug}/`)) bad(`초안 ${g.slug}가 sitemap에 있음`);
}
const hasIndex = existsSync(join(DIST, 'guide/index.html'));
if (pub.length && !hasIndex) bad('발행 글이 있는데 /guide/ 목록이 없음');
if (!pub.length && hasIndex) bad('발행 글이 없는데 /guide/ 목록이 있음');
if (!pub.length && sitemap.includes('/guide/')) bad('발행 글이 없는데 sitemap에 /guide/가 있음');
for (const page of ['index.html', 'method/index.html', 'diagnosis/index.html']) {
  const has = read(page).includes('href="/guide/"');
  if (pub.length && !has) bad(`${page}: 꼬리말(또는 메인 하단)에 /guide/ 링크가 없음`);
  if (!pub.length && has) bad(`${page}: 발행 글이 없는데 /guide/ 링크가 있음`);
}
if (pub.length && !read('index.html').includes('class="guide-more"')) bad('메인 하단 가이드 링크가 없음');

const titles = new Map<string, string>();
const descs = new Map<string, string>();
const ldTypes: Record<string, string[]> = {};
for (const g of pub) {
  const path = `guide/${g.slug}/index.html`;
  if (!existsSync(join(DIST, path))) {
    bad(`발행 글 ${g.slug}의 HTML이 없음`);
    continue;
  }
  const h = read(path);
  const title = h.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
  const desc = h.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '';
  const canon = h.match(/<link rel="canonical" href="([^"]*)"/)?.[1] ?? '';
  if (!title.startsWith(g.title)) bad(`${g.slug}: title`);
  if (!desc) bad(`${g.slug}: description 없음`);
  if (!canon.endsWith(`/guide/${g.slug}/`) || canon.includes('%VITE')) bad(`${g.slug}: canonical ${canon}`);
  if (/name="robots" content="noindex"/.test(h)) bad(`${g.slug}: 발행 글에 noindex`);
  for (const p of ['og:title', 'og:description', 'og:url', 'og:type', 'og:image']) if (!h.includes(`property="${p}"`)) bad(`${g.slug}: ${p} 없음`);
  if ((h.match(/<h1[\s>]/g) ?? []).length !== 1) bad(`${g.slug}: h1 개수`);
  if (titles.has(title)) bad(`title 중복: ${g.slug}, ${titles.get(title)}`);
  if (descs.has(desc)) bad(`description 중복: ${g.slug}, ${descs.get(desc)}`);
  titles.set(title, g.slug);
  descs.set(desc, g.slug);
  ldTypes[g.slug] = [];
  for (const m of h.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)) {
    try {
      const j = JSON.parse(m[1]);
      ldTypes[g.slug].push(j['@type']);
      if (JSON.stringify(j).includes('%VITE')) bad(`${g.slug}: JSON-LD에 치환되지 않은 값`);
      if (j['@type'] === 'Article' && (j.headline !== g.title || j.dateModified !== g.updated)) bad(`${g.slug}: Article 내용`);
      if (j['@type'] === 'BreadcrumbList' && j.itemListElement.at(-1).item !== canon) bad(`${g.slug}: BreadcrumbList 마지막 항목`);
    } catch {
      bad(`${g.slug}: JSON-LD 파싱 실패`);
    }
  }
  if (!ldTypes[g.slug].includes('Article') || !ldTypes[g.slug].includes('BreadcrumbList')) bad(`${g.slug}: JSON-LD 종류 ${ldTypes[g.slug]}`);
  if (!sitemap.includes(`/guide/${g.slug}/</loc><lastmod>${g.updated}</lastmod>`)) bad(`${g.slug}: sitemap 항목`);
  if (!read('guide/index.html').includes(`href="/guide/${g.slug}/"`)) bad(`${g.slug}: 목록에 없음`);
  // 관련 글: 발행된 것만 링크
  const rel = h.match(/<section class="related"[\s\S]*?<\/section>/)?.[0] ?? '';
  for (const r of g.related) {
    const linked = rel.includes(`href="/guide/${r}/"`);
    const isPub = pub.some((p) => p.slug === r);
    if (isPub && !linked) bad(`${g.slug}: 관련 글 ${r} 링크 없음`);
    if (!isPub && linked) bad(`${g.slug}: 초안 ${r}로 관련 글 링크`);
  }
}

// dist 전체의 내부 링크
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
}
let links = 0;
for (const f of walk(DIST).filter((f) => f.endsWith('.html'))) {
  for (const m of readFileSync(f, 'utf8').matchAll(/href="(\/[^"#?]*)/g)) {
    links++;
    const p = m[1];
    const target = p.endsWith('/') ? join(DIST, p, 'index.html') : join(DIST, p);
    if (!existsSync(target)) bad(`깨진 링크 ${p} (${f})`);
  }
}

// 관련 글은 서로 링크해야 한다(발행 글끼리)
for (const g of pub)
  for (const r of g.related) {
    const other = pub.find((p) => p.slug === r);
    if (other && !other.related.includes(g.slug)) bad(`관련 글 한쪽 방향: ${g.slug} → ${r}`);
  }

if (problems.length) {
  console.error(`가이드 dist 점검 실패 ${problems.length}건:`);
  problems.forEach((p) => console.error(' - ' + p));
  process.exit(1);
}
console.log(`가이드 dist 점검 통과: 발행 ${pub.length}편, 초안 ${draft.length}편, 내부 링크 ${links}개 확인`);
