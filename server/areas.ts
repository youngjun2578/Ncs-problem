import type { AreaId } from './engine/types.js';

export interface AreaMeta {
  id: AreaId;
  name: string;
  /** 이 영역이 무엇을 보는지 */
  description: string;
  /** 유형 학습 순서 (기초 → 응용) */
  studyOrder: string[];
  /** 한 문항당 권장 풀이 시간(초). 넘으면 "시간 관리" 안내 */
  targetSec: number;
}

export const AREAS: AreaMeta[] = [
  {
    id: 'arith',
    name: '기초연산',
    description: '업무 상황을 식으로 옮기고 사칙연산·비율 계산을 정확하고 빠르게 하는지 봅니다. 속력·농도·일의 양처럼 "무엇을 기준으로 나누는가"가 핵심이에요.',
    studyOrder: ['단위 환산', '증가율·비율', '나이·연령', '간단한 방정식 응용', '할인·이익', '거리·속력·시간', '농도', '일의 양'],
    targetSec: 75,
  },
  {
    id: 'stats',
    name: '기초통계',
    description: '평균·중앙값 같은 대푯값과 경우의 수·확률을 이용해 자료의 특성을 요약하고 가능성을 계산하는지 봅니다.',
    studyOrder: ['평균', '중앙값', '경우의 수', '순열·조합', '확률'],
    targetSec: 75,
  },
  {
    id: 'chartRead',
    name: '도표분석',
    description: '표와 그래프에서 필요한 수치를 정확히 찾아 증감률·비중·배수를 계산하고 비교하는지 봅니다.',
    studyOrder: ['비중', '배수·차이 비교', '1인당 수치', '증감률', '%p와 % 구분', '증가율 최대 시점'],
    targetSec: 90,
  },
  {
    id: 'chartMake',
    name: '도표작성',
    description: '주어진 자료를 목적에 맞는 그래프로 옮기는지, 그래프의 눈금과 항목을 자료와 정확히 대응시키는지 봅니다.',
    studyOrder: ['그래프 종류 선택', '막대그래프 작성', '꺾은선그래프 작성', '원그래프 작성', '증가율 그래프 작성'],
    targetSec: 90,
  },
];

export const AREA_BY_ID = Object.fromEntries(AREAS.map((a) => [a.id, a])) as Record<AreaId, AreaMeta>;
