import { requireAuth } from "@/lib/auth";
import { SessionsProvider } from "@/components/pos/sessions-context";
import { PosLoadingBar } from "./pos/_components/pos-loading-bar";

/**
 * POS 라우트 그룹 — v2 가 메인. 자체 헤더/탭바 가지므로 글로벌 사이드바/헤더 없음.
 * h-dvh = iOS Safari 주소창 동적 대응.
 */
export default async function PosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuth();
  return (
    <SessionsProvider>
      <PosLoadingBar />
      <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
        {children}
      </div>
    </SessionsProvider>
  );
}
