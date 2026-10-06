/** Vercel 함수: POST /api/payments/cancel — 결제창에서 취소한 결제 전 주문 닫기(로그인 필요). 결제 스위치가 꺼져 있으면 404 */
import { handlePaymentCancel } from '../../server/payments/handlers.js';

export function POST(request: Request): Promise<Response> {
  return handlePaymentCancel(request);
}

export function GET(request: Request): Promise<Response> {
  return handlePaymentCancel(request);
}
