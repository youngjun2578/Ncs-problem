/**
 * 결제사 인터페이스. 결제사마다 이 모양을 채우는 어댑터를 하나씩 만든다(지금은 가짜 결제사만).
 * 결제사가 알려 주는 값은 모두 서버가 다시 확인한다. 브라우저가 보낸 금액·상품 값은 쓰지 않는다.
 * 실제 결제사 어댑터가 채울 항목은 docs/payments-plan.md에 정리했다.
 */

/** 주문 준비에 넘기는 값(서버가 정한 값만) */
export interface OrderForProvider {
  orderId: string;
  /** 서버 상수 금액(원) */
  amount: number;
  orderName: string;
}

/**
 * 브라우저가 결제창을 열 때 쓸 값. 결제사마다 다르다.
 *  - fake: 사이트 안의 시험 결제 창(실제 결제 아님)
 */
export type Checkout = { kind: 'fake' };

/** 서버 대 서버 결제 확인 결과 */
export type ConfirmResult =
  | { status: 'paid'; orderId: string; amount: number; paymentId: string }
  | { status: 'failed'; code: string }
  | { status: 'unavailable' };

/** 웹훅을 결제사와 무관한 모양으로 바꾼 것. eventId는 같은 알림의 재전송을 가리기 위한 값 */
export interface PaymentEvent {
  eventId: string;
  type: 'paid' | 'failed' | 'canceled' | 'refunded';
  orderId: string;
  paymentId: string | null;
  amount: number | null;
}

export interface PaymentProvider {
  /** 결제사 이름(주문에 기록) */
  readonly name: string;
  /** 시험용 결제사인가(화면에 "시험 결제" 표시) */
  readonly isTest: boolean;
  /** 주문 준비: 결제창을 열 값을 만든다 */
  prepare(order: OrderForProvider): Promise<Checkout>;
  /** 결제 확인(승인): 결제창에서 돌아온 값을 결제사에 직접 물어 확정한다. 금액은 서버의 주문 금액을 넘긴다 */
  confirm(input: { orderId: string; amount: number; paymentKey: string }): Promise<ConfirmResult>;
  /** 취소·환불 */
  cancel(input: { paymentId: string; amount: number; reason: string }): Promise<{ ok: boolean }>;
  /** 웹훅 검증: 서명이 틀리거나 모양이 다르면 null */
  verifyWebhook(rawBody: string, headers: Headers): PaymentEvent | null;
}
