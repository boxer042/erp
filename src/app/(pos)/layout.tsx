import "@/jm/tokens.css";
import { requireAuth } from "@/lib/auth";
import { SessionsProvider } from "@/components/pos/sessions-context";
import { PosLoadingBar } from "./pos/_components/pos-loading-bar";
import { PosThemeWrapper } from "./pos/_components/pos-theme-wrapper";

/**
 * POS 라우트 그룹 — v2 가 메인. 자체 헤더/탭바 가지므로 글로벌 사이드바/헤더 없음.
 * h-dvh = iOS Safari 주소창 동적 대응.
 *
 * jm 디자인 시스템에 연결됨:
 * - PosThemeWrapper 가 JmScope 로 감싸 토큰 cascade + 라이트/다크/auto 테마 지원
 * - 사용자 선택은 localStorage 에 저장됨
 */
export default async function PosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuth();
  return (
    <SessionsProvider>
      <PosThemeWrapper>
        <PosLoadingBar />
        <div className="flex h-dvh flex-col overflow-hidden bg-[var(--jm-bg)] text-[var(--jm-text)]">
          {children}
        </div>
      </PosThemeWrapper>
    </SessionsProvider>
  );
}
