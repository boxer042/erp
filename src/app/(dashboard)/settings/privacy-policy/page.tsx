"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  JmButton,
  JmIconButton,
  JmBadge,
  JmCard,
  JmCardContent,
  JmCardHeader,
  JmCardTitle,
  JmTextarea,
  JmSkeleton,
} from "@/jm";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";

interface PolicyVersion {
  id: string;
  publishedAt: string;
  isCurrent: boolean;
}

interface Policy {
  id: string;
  content: string;
  publishedAt: string;
  isCurrent: boolean;
  versions: PolicyVersion[];
}

export default function PrivacyPolicySettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [content, setContent] = useState<string | null>(null);

  const policyQuery = useQuery({
    queryKey: ["privacy-policy"],
    queryFn: () => apiGet<Policy>("/api/privacy-policy"),
  });

  // 최초 로드 시 1회 초기화 (렌더 중 비교 패턴)
  if (content === null && policyQuery.data) {
    setContent(policyQuery.data.content);
  }

  const saveMutation = useMutation({
    mutationFn: (publishNewVersion: boolean) =>
      apiMutate("/api/privacy-policy", "PUT", { content, publishNewVersion }),
    onSuccess: (_, publishNewVersion) => {
      toast.success(
        publishNewVersion
          ? "새 버전으로 게시되었습니다"
          : "약관이 저장되었습니다",
      );
      queryClient.invalidateQueries({ queryKey: ["privacy-policy"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "저장에 실패했습니다"),
  });

  const publishNew = () => {
    if (
      !window.confirm(
        "새 버전으로 게시하면 별도 버전 번호가 부여됩니다.\n약관을 중대하게 변경했을 때만 사용하세요. 진행할까요?",
      )
    )
      return;
    saveMutation.mutate(true);
  };

  const policy = policyQuery.data;

  return (
    <div className="min-h-full bg-[var(--jm-bg)]">
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <div className="flex items-center gap-3">
          <JmIconButton
            variant="ghost"
            size="sm"
            onClick={() => router.push("/settings")}
            aria-label="뒤로"
          >
            <ArrowLeft className="h-4 w-4" />
          </JmIconButton>
          <h1 className="text-jm-lg font-semibold text-[var(--jm-text)]">
            시리얼 조회 서비스 약관
          </h1>
          {policy && (
            <JmBadge variant="outline" className="ml-1">
              현재 {policy.id}
            </JmBadge>
          )}
        </div>

        <JmCard>
          <JmCardHeader>
            <JmCardTitle className="text-jm-base">개인정보 처리방침</JmCardTitle>
          </JmCardHeader>
          <JmCardContent className="space-y-4">
            <p className="text-jm-sm text-[var(--jm-text-muted)]">
              POS 고객 등록 동의 화면과 손님 공개 페이지에 노출됩니다. 오타·표현
              수정은 [저장], 수집 항목·목적 등 중대 변경은 [새 버전으로 게시]를
              사용하세요.
            </p>
            {policyQuery.isPending || content === null ? (
              <JmSkeleton className="h-80 w-full" />
            ) : (
              <JmTextarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={20}
                className="font-mono text-jm-sm leading-relaxed"
              />
            )}
            <div className="flex justify-end gap-2">
              <JmButton
                variant="outline"
                size="sm"
                onClick={publishNew}
                disabled={saveMutation.isPending || content === null}
              >
                새 버전으로 게시
              </JmButton>
              <JmButton
                size="sm"
                onClick={() => saveMutation.mutate(false)}
                disabled={saveMutation.isPending || content === null}
              >
                {saveMutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                저장
              </JmButton>
            </div>
          </JmCardContent>
        </JmCard>

        {policy && policy.versions.length > 1 && (
          <JmCard>
            <JmCardHeader>
              <JmCardTitle className="text-jm-base">버전 이력</JmCardTitle>
            </JmCardHeader>
            <JmCardContent className="space-y-1.5">
              {policy.versions.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between border-b border-[var(--jm-border)] py-1.5 text-jm-sm last:border-b-0"
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono">{v.id}</span>
                    {v.isCurrent && <JmBadge variant="solid">현재</JmBadge>}
                  </span>
                  <span className="text-[var(--jm-text-muted)]">
                    {format(new Date(v.publishedAt), "yyyy-MM-dd HH:mm")}
                  </span>
                </div>
              ))}
            </JmCardContent>
          </JmCard>
        )}
      </div>
    </div>
  );
}
