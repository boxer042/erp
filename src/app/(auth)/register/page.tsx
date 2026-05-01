import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function RegisterPage() {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">회원가입이 차단되어 있습니다</CardTitle>
        <CardDescription>
          이 ERP는 초대받은 사용자만 접근할 수 있습니다.
          <br />
          관리자에게 계정 발급을 요청해 주세요.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground text-center">
        관리자는 Supabase 대시보드에서 사용자 계정을 추가하고
        <br />
        ERP의 ALLOWED_EMAILS 환경변수에 이메일을 등록해야 합니다.
      </CardContent>
      <CardFooter>
        <Link href="/login" className="w-full">
          <Button className="w-full" variant="outline">
            로그인 페이지로
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}
