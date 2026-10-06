/** Vercel 함수: POST /api/payments/fake-approve — 가짜 결제사의 시험 결제창(시험용, Production 거부). 결제 스위치가 꺼져 있으면 404 */
import { handlePaymentFakeApprove } from '../../server/payments/handlers.js';

export function POST(request: Request): Promise<Response> {
  return handlePaymentFakeApprove(request);
}

export function GET(request: Request): Promise<Response> {
  return handlePaymentFakeApprove(request);
}
