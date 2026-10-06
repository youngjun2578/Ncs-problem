/** Vercel 함수: POST /api/payments/order — 주문 만들기(로그인 필요). 결제 스위치가 꺼져 있으면 404 */
import { handlePaymentOrder } from '../../server/payments/handlers.js';

export function POST(request: Request): Promise<Response> {
  return handlePaymentOrder(request);
}

export function GET(request: Request): Promise<Response> {
  return handlePaymentOrder(request);
}
