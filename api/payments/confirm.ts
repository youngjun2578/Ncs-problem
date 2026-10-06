/** Vercel 함수: POST /api/payments/confirm — 결제 확인(로그인 필요). 결제 스위치가 꺼져 있으면 404 */
import { handlePaymentConfirm } from '../../server/payments/handlers.js';

export function POST(request: Request): Promise<Response> {
  return handlePaymentConfirm(request);
}

export function GET(request: Request): Promise<Response> {
  return handlePaymentConfirm(request);
}
