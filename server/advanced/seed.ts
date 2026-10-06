/**
 * 심화 세트용 하위 시드. 세트 시드 하나에서 용도(이름표)마다 서로 다른 32비트 시드를 만든다.
 *  - 'pick': 영역마다 어떤 템플릿을 쓸지 고르는 난수
 *  - 'item:0' ~ 'item:11': 그 자리 문항 하나를 만드는 난수
 * 이름표가 다르면 난수열이 서로 겹치지 않으므로, 한 문항이 난수를 몇 번 쓰든 다른 문항과 템플릿 고르기에 영향이 없다.
 */

/** 32비트 정수를 고르게 섞는다(MurmurHash3의 마무리 단계) */
function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** 세트 시드와 이름표에서 하위 시드를 만든다(이름표는 FNV-1a로 섞는다) */
export function subSeed(seed: number, label: string): number {
  let h = 0x811c9dc5 ^ fmix32(seed >>> 0);
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return fmix32(h);
}

export const PICK_LABEL = 'pick';
export const itemLabel = (slot: number) => `item:${slot}`;
