import "@/jm/tokens.css";
import { JmScope } from "@/jm/theme/scope";

/**
 * 외부 접근 페이지용 레이아웃 (인증 없음).
 * 거래처가 토큰 URL 로 접근하는 페이지 전용. JM 디자인 시스템 적용.
 * theme="light" 고정 — 거래처가 보는 페이지라 일관된 라이트 모드.
 */
export default function ExternalLayout({ children }: { children: React.ReactNode }) {
  return (
    <JmScope theme="light" className="min-h-dvh">
      {children}
    </JmScope>
  );
}
