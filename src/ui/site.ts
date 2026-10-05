/** 메인·안내 페이지용 진입점. 스위치가 켜진 빌드에서만 HTML에 들어간다(머리말 계정 메뉴). */
// 조건을 import 자리에 직접 써야 꺼진 빌드에서 번들러가 지운다
if (import.meta.env.VITE_MONETIZATION_ENABLED === 'true') void import('./monetization').then((m) => m.mountHeader());
