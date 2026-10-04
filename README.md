# NCS 수리능력 연습 진단

서버·DB 없이 브라우저에서만 동작하는 정적 사이트(Vite + TypeScript)입니다.
4개 영역(기초연산·기초통계·도표분석·도표작성)에서 3문항씩 12문항을 풀고, 영역별 리포트를 받습니다.
모든 문제는 직접 만든 템플릿으로 매번 새로 생성하며, 외부 기출·문제집 문장을 쓰지 않습니다.

## 명령

```bash
npm install
npm run dev        # 개발 서버
npm run validate   # 문제 생성기 검증 (실패 시 exit 1)
npm run build      # validate → 타입 검사 → vite build (검증 실패 시 빌드 중단)
npm run preview    # 빌드 결과 미리보기
npx tsx scripts/sample.ts chartRead 2   # 템플릿 id 접두어별 예시 문제 출력
```

`validate` 옵션: `PER_TEMPLATE`(기본 3000), `SETS`(기본 5000), `SEED_OFFSET`(다른 시드 범위 탐색), `VERBOSE`.

## 배포 전 설정 (`.env`)

| 변수 | 용도 |
| --- | --- |
| `VITE_SITE_URL` | canonical·OG·sitemap 절대 주소 (현재 `https://example.com` 자리표시자) |
| `VITE_CONTACT_EMAIL` | 꼬리말·안내 페이지 문의 이메일 (현재 `contact@example.com` 자리표시자) |
| `VITE_LAST_UPDATED` | 꼬리말·안내 페이지의 최종 업데이트 날짜, sitemap `lastmod` |

## 구조

```
index.html               정적 랜딩 (meta/OG/JSON-LD)
diagnosis/index.html     진단 앱 셸
method/index.html        문제 생성·검증 방식, 판정 기준, 개인정보, 유의사항, 문의
src/
  engine/
    rng.ts               시드 난수 (mulberry32)
    choices.ts           보기 5개 구성: 흔한 실수 오답 우선, 부족할 때만 근접값("계산 실수")
    set.ts               세트 구성: 영역별 서로 다른 유형 3개, 가능하면 난이도 1·2·3
    mistakes.ts          실수 태그 → 리포트의 "틀린 패턴" 문장
    frac.ts, format.ts   기약분수·조합, 숫자 표기
    types.ts             Template / Generated / Problem
  templates/<영역>/<유형>.ts   24개 유형 (기초연산 8, 기초통계 5, 도표분석 6, 도표작성 5)
  registry.ts            템플릿 목록
  areas.ts               영역 설명, 학습 순서, 권장 시간
  charts/render.ts       막대·꺾은선·원·점그래프·표를 SVG/HTML 문자열로 (DOM 없이 동작)
  report/analyze.ts      영역별 정답률·시간·수준·틀린 패턴·학습 순서 (순수 함수)
  ui/                    풀이 화면, 결과 리포트
  styles/                tokens / base / components / chart / report / landing / print
  partials/              공통 머리말·꼬리말 (빌드 시 삽입)
scripts/validate.ts      생성기 검증
```

## 템플릿 추가하기

```ts
export const myType: Template = {
  id: 'arith.myType', area: 'arith', subtype: '유형 이름', difficulty: 2,
  generate(rng) {
    // 1) 정답을 먼저 정하고 숫자를 역산한다
    // 2) 오답은 흔한 실수를 계산식으로 재현하고 mistakeTag를 붙인다 (mistakes.ts에 있는 태그만 가능)
    // 3) 문장 틀은 3가지 이상
    return { text, answer, wrongs: [{ value, mistakeTag: '기준량 혼동' }, ...], steps, format, near };
  },
};
```

`registry.ts`에 추가하고 `areas.ts`의 `studyOrder`에 유형 이름을 넣은 뒤 `npm run validate`로 확인합니다.

## 광고

결과 화면 하단의 `.ad-slot[data-ad-slot="result-bottom"]`만 광고 자리로 비워 두었습니다(풀이 중에는 없음).
광고를 넣을 때는 `method/index.html`의 개인정보 안내를 먼저 갱신하세요.
