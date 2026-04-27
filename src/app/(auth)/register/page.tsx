"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error("비밀번호가 일치하지 않습니다");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
      },
    });

    if (error) {
      toast.error("회원가입 실패", {
        description: error.message,
      });
      setLoading(false);
      return;
    }

    toast.success("회원가입 성공", {
      description: "이메일을 확인해주세요",
    });
    router.push("/login");
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand text-brand-foreground">
            <span className="text-lg font-bold">E</span>
          </div>
        </div>
        <CardTitle className="text-2xl">회원가입</CardTitle>
        <CardDescription>JAEWOOMADE ERP 계정 생성</CardDescription>
      </CardHeader>
      <form onSubmit={handleRegister}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">이름</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">이메일</Label>
            <Input
              id="email"
              type="email"
              placeholder="email@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">비밀번호</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">비밀번호 확인</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full bg-brand text-brand-foreground hover:bg-brand/90" disabled={loading}>
            {loading ? "처리 중..." : "회원가입"}
          </Button>
          <p className="text-sm text-muted-foreground">
            이미 계정이 있으신가요?{" "}
            <Link href="/login" className="text-brand hover:underline">
              로그인
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
