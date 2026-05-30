import Link from "next/link";
import {
  JmButton,
  JmCard,
  JmCardContent,
  JmCardDescription,
  JmCardFooter,
  JmCardHeader,
  JmCardTitle,
} from "@/jm";

export default function RegisterPage() {
  return (
    <JmCard>
      <JmCardHeader className="text-center">
        <JmCardTitle className="text-jm-2xl">
          회원가입이 차단되어 있습니다
        </JmCardTitle>
        <JmCardDescription>
          이 ERP는 초대받은 사용자만 접근할 수 있습니다.
          <br />
          관리자에게 계정 발급을 요청해 주세요.
        </JmCardDescription>
      </JmCardHeader>
      <JmCardContent className="text-jm-sm text-[var(--jm-text-muted)] text-center">
        관리자는 Supabase 대시보드에서 사용자 계정을 추가하고
        <br />
        ERP의 ALLOWED_EMAILS 환경변수에 이메일을 등록해야 합니다.
      </JmCardContent>
      <JmCardFooter className="justify-center">
        <Link href="/login" className="w-full">
          <JmButton className="w-full" variant="outline">
            로그인 페이지로
          </JmButton>
        </Link>
      </JmCardFooter>
    </JmCard>
  );
}
