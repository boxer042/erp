"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function AccessDeniedPage() {
  const router = useRouter();
  const supabase = createClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">접근 권한이 없습니다</CardTitle>
        <CardDescription>
          이 계정은 ERP 사용 권한이 부여되어 있지 않습니다.
          <br />
          관리자에게 문의해 주세요.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground text-center">
        관리자가 화이트리스트에 이메일을 등록한 뒤 다시 로그인하면 접속할 수 있습니다.
      </CardContent>
      <CardFooter>
        <Button
          onClick={handleSignOut}
          className="w-full"
          variant="outline"
        >
          로그아웃
        </Button>
      </CardFooter>
    </Card>
  );
}
