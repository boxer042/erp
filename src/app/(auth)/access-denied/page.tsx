"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  JmButton,
  JmCard,
  JmCardContent,
  JmCardDescription,
  JmCardFooter,
  JmCardHeader,
  JmCardTitle,
  JmScope,
} from "@/jm";

export default function AccessDeniedPage() {
  const router = useRouter();
  const supabase = createClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <JmScope theme="auto" className="bg-transparent">
      <JmCard>
        <JmCardHeader className="text-center">
          <JmCardTitle className="text-jm-2xl">접근 권한이 없습니다</JmCardTitle>
          <JmCardDescription>
            이 계정은 ERP 사용 권한이 부여되어 있지 않습니다.
            <br />
            관리자에게 문의해 주세요.
          </JmCardDescription>
        </JmCardHeader>
        <JmCardContent className="text-jm-sm text-[var(--jm-text-muted)] text-center">
          관리자가 화이트리스트에 이메일을 등록한 뒤 다시 로그인하면 접속할 수 있습니다.
        </JmCardContent>
        <JmCardFooter>
          <JmButton
            onClick={handleSignOut}
            className="w-full"
            variant="outline"
          >
            로그아웃
          </JmButton>
        </JmCardFooter>
      </JmCard>
    </JmScope>
  );
}
