"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";

import { apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { JmBadge, JmButton } from "@/jm";

interface KakaoStatus {
  configured: boolean;
  connected: boolean;
  refreshExpiresAt: string | null;
}

/**
 * 카카오 알림 연결 버튼/상태. KAKAO_* env 미설정(미configured) 이면 렌더 안 함.
 * 연결 시작은 /api/kakao/connect 로 풀 네비게이션(OAuth 리다이렉트).
 */
export function KakaoConnect() {
  const router = useRouter();

  const status = useQuery({
    queryKey: queryKeys.kakao.status(),
    queryFn: ({ signal }) =>
      apiGet<KakaoStatus>("/api/kakao/status", undefined, signal),
  });

  // 콜백 복귀 시 1회 토스트 (useSearchParams 대신 window 로 — suspense 경계 불필요)
  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get("kakao");
    if (k === "connected") {
      toast.success("카카오 알림이 연결되었습니다");
      router.replace("/notes");
    } else if (k === "error") {
      toast.error("카카오 연결에 실패했습니다");
      router.replace("/notes");
    }
  }, [router]);

  if (!status.data?.configured) return null;

  if (status.data.connected) {
    return (
      <JmBadge variant="success" size="sm">
        <MessageCircle className="size-3" />
        카카오 알림 연결됨
      </JmBadge>
    );
  }

  return (
    <JmButton
      variant="outline"
      size="sm"
      onClick={() => {
        window.location.href = "/api/kakao/connect";
      }}
    >
      <MessageCircle className="size-4" />
      카카오 알림 연결
    </JmButton>
  );
}
