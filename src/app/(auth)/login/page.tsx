"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  JmScope,
  JmButton,
  JmInput,
  JmFormField,
  JmCard,
  JmCardHeader,
  JmCardTitle,
  JmCardDescription,
  JmCardContent,
  JmCardFooter,
} from "@/jm";
import { toast } from "sonner";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      toast.error("로그인 실패", {
        description: error.message,
      });
      setLoading(false);
      return;
    }

    toast.success("로그인 성공");
    router.push("/");
    router.refresh();
  };

  return (
    <JmScope theme="auto">
      <JmCard>
        <JmCardHeader className="items-center text-center">
          <div className="flex justify-center mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--jm-action)] text-[var(--jm-action-fg)]">
              <span className="text-jm-lg font-bold">E</span>
            </div>
          </div>
          <JmCardTitle className="text-jm-2xl">JAEWOOMADE ERP</JmCardTitle>
          <JmCardDescription>로그인하여 시작하세요</JmCardDescription>
        </JmCardHeader>
        <form onSubmit={handleLogin}>
          <JmCardContent className="space-y-4">
            <JmFormField label="이메일" htmlFor="email">
              <JmInput
                id="email"
                type="email"
                placeholder="email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </JmFormField>
            <JmFormField label="비밀번호" htmlFor="password">
              <JmInput
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </JmFormField>
          </JmCardContent>
          <JmCardFooter className="flex-col items-stretch gap-3">
            <JmButton type="submit" variant="cta" className="w-full" disabled={loading}>
              {loading && <Loader2 className="animate-spin" />}
              {loading ? "로그인 중..." : "로그인"}
            </JmButton>
            <p className="text-jm-sm text-[var(--jm-text-muted)] text-center">
              계정이 필요하신가요? 관리자에게 문의해 주세요.
            </p>
          </JmCardFooter>
        </form>
      </JmCard>
    </JmScope>
  );
}
