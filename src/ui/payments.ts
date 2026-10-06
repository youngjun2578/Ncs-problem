import '../styles/payments.css';
import type { ApiError } from '../../shared/api';
import { esc } from './dom';

/*
 * 결제 진행 화면. VITE_PAYMENTS_ENABLED=true로 빌드했을 때만 monetization.ts가 동적으로 불러온다.
 * 꺼진 빌드에는 이 파일이 들어가지 않고, "이용권 구매"는 이전처럼 "결제는 준비 중입니다"를 알린다.
 *
 * 흐름: 주문 만들기(서버가 주문번호·금액을 정함) → 결제창 → 결제 확인(서버가 결제사에 다시 확인) → 이용권 상태 다시 읽기
 * 결제창은 결제사마다 다르다. 지금은 가짜 결제사의 "시험 결제" 창만 있다(실제 결제 없음).
 * 브라우저 저장소는 쓰지 않는다.
 */

type Modal = { dlg: HTMLDialogElement; close: () => void; onClose: (f: () => void) => void };
export interface CheckoutDeps {
  accessToken: () => Promise<string | null>;
  recheck: () => Promise<unknown>;
  openModal: (opts: { title: string; body: string; closable?: boolean; describedBy?: string }) => Modal;
  notice: (title: string, message?: string) => Promise<unknown>;
}

interface OrderResponse {
  orderId: string;
  amount: number;
  orderName: string;
  test: boolean;
  checkout: { kind: string };
}

class PayError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
  ) {
    super(message);
  }
}

async function post<T>(path: string, body: unknown, token?: string | null): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: token ? { 'content-type': 'application/json', authorization: `Bearer ${token}` } : { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    throw new PayError('서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.', null);
  }
  const data = (await res.json().catch(() => null)) as (T & Partial<ApiError>) | null;
  if (!res.ok || !data) throw new PayError(data?.message ?? `서버 응답 오류 (${res.status})`, data?.error ?? 'internal');
  return data;
}

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

/** "이용권 구매"(로그인했고 이용권이 없을 때) */
export async function checkout(deps: CheckoutDeps): Promise<void> {
  const token = await deps.accessToken();
  if (!token) {
    await deps.notice('로그인이 필요합니다', '로그인이 만료되었습니다. 다시 로그인한 뒤 이용권을 구매해 주세요.');
    return;
  }
  const m = deps.openModal({
    title: '이용권 구매',
    describedBy: 'pay',
    closable: false,
    body: `<div id="@pay"><p class="pay-status" role="status">주문을 준비하고 있습니다…</p></div>`,
  });
  const area = m.dlg.querySelector<HTMLElement>('[id$="-pay"]')!;
  /** 창 내용 바꾸기. 버튼은 [label, 동작] 목록 */
  const show = (html: string, buttons: [string, () => void, boolean?][] = [['닫기', m.close, true]]) => {
    area.innerHTML = `${html}<div class="pay-actions">${buttons.map(([label, , primary], i) => `<button type="button" class="${primary ? 'btn-primary' : 'btn-secondary'}" data-i="${i}">${esc(label)}</button>`).join('')}</div>`;
    area.querySelectorAll<HTMLButtonElement>('[data-i]').forEach((b) => b.addEventListener('click', () => buttons[Number(b.dataset.i)][1]()));
    area.querySelector<HTMLButtonElement>('.btn-primary, .btn-secondary')?.focus();
  };
  const busy = (text: string) => {
    area.innerHTML = `<p class="pay-status" role="status">${esc(text)}</p>`;
  };
  const failWith = (title: string, e: unknown) => show(`<p class="auth-lead">${esc(title)}</p><p class="pay-status">${esc(e instanceof Error ? e.message : String(e))}</p>`);

  let order: OrderResponse;
  try {
    order = await post<OrderResponse>('/api/payments/order', {}, token);
  } catch (e) {
    if (e instanceof PayError && e.code === 'already_entitled') {
      m.close();
      await deps.recheck();
      await deps.notice('이미 이용권이 있습니다', '새 문제로 진단, 전 문항 해설, 영역별 상세를 이용할 수 있습니다.');
      return;
    }
    return failWith('주문을 만들지 못했습니다.', e);
  }
  const testNote = order.test ? '<p class="pay-test">시험 결제</p>' : '';
  const summary = `
    ${testNote}
    <dl class="pay-summary"><dt>상품</dt><dd>${esc(order.orderName)}</dd><dt>금액</dt><dd>${esc(won(order.amount))}</dd></dl>`;

  /** 결제 확인. 응답을 못 받았으면 같은 결제 키로 다시 확인할 수 있다(서버가 한 번만 반영) */
  const confirm = async (paymentKey: string) => {
    busy('결제를 확인하고 있습니다… 창을 닫지 마세요.');
    let r: { status: string; duplicate?: boolean };
    try {
      r = await post('/api/payments/confirm', { orderId: order.orderId, paymentKey, amount: order.amount }, await deps.accessToken());
    } catch (e) {
      if (e instanceof PayError && e.code === null)
        return show(`<p class="auth-lead">결제 확인 결과를 받지 못했습니다.</p><p class="pay-status">${esc(e.message)}</p>`, [
          ['다시 확인', () => void confirm(paymentKey), true],
          ['닫기', m.close],
        ]);
      return failWith('결제를 확인하지 못했습니다. 이용권은 적용되지 않았습니다.', e);
    }
    if (r.status !== 'paid') return show(`${testNote}<p class="auth-lead">결제가 완료되지 않았습니다. 이용권은 적용되지 않았습니다.</p>`);
    await deps.recheck();
    show(
      `${testNote}<p class="auth-lead">${
        r.duplicate
          ? '결제가 확인되었지만 이 계정에는 이미 이용권이 있습니다. 처리 방법은 문의해 주세요.'
          : '이용권이 적용되었습니다. 새 문제로 진단하면 전 문항 해설과 영역별 상세를 볼 수 있습니다.'
      }</p>`,
    );
  };

  /** 가짜 결제사의 결제창 결과를 받아 결제 키를 만든다(시험용, 실제 결제 없음) */
  const fakePay = async (outcome: 'success' | 'fail') => {
    busy('결제를 처리하고 있습니다…');
    try {
      const k = await post<{ paymentKey: string }>('/api/payments/fake-approve', { orderId: order.orderId, amount: order.amount, outcome });
      await confirm(k.paymentKey);
    } catch (e) {
      failWith('결제를 처리하지 못했습니다.', e);
    }
  };
  const cancel = async () => {
    busy('결제를 취소하고 있습니다…');
    try {
      await post('/api/payments/cancel', { orderId: order.orderId }, await deps.accessToken());
      show(`${testNote}<p class="auth-lead">결제를 취소했습니다. 이용권은 적용되지 않았습니다.</p>`);
    } catch (e) {
      failWith('취소 처리 중 오류가 났습니다. 결제는 진행되지 않았습니다.', e);
    }
  };

  if (order.checkout.kind === 'fake') {
    show(`${summary}<p class="pay-status">실제 결제가 아닙니다. 가짜 결제사로 결제 흐름만 시험합니다. 결과를 고르세요.</p>`, [
      ['시험 결제 성공', () => void fakePay('success'), true],
      ['시험 결제 실패', () => void fakePay('fail')],
      ['결제 취소', () => void cancel()],
    ]);
    return;
  }
  // 실제 결제사 결제창은 결제사가 정해진 뒤 연결한다(docs/payments-plan.md)
  show(`${summary}<p class="auth-lead">이 결제 방식은 아직 연결되지 않았습니다.</p>`, [['결제 취소', () => void cancel(), true]]);
}
