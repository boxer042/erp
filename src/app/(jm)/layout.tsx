import "@/jm/tokens.css";

/**
 * jm 디자인 시스템 라우트 그룹.
 * tokens.css 만 로드 — JmScope 는 page 안에서 감싸서 theme state 토글 가능하게 함.
 * 인증 X — 데모/showcase 페이지.
 */
export default function JmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
