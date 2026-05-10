import "@/jm/tokens.css";

/**
 * customers 라우트 — jm 디자인 시스템 적용 영역.
 * tokens.css 만 로드. JmScope wrap 은 listing 페이지(page.tsx) 만 자체적으로 함 —
 * /customers/ledger 같은 기존 shadcn 서브라우트가 영향받지 않도록 격리.
 */
export default function CustomersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
