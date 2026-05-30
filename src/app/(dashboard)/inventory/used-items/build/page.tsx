"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";

import { apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { parseComma } from "@/lib/utils";
import {
  jmToast as toast,
  JmButton,
  JmContainer,
  JmIconButton,
} from "@/jm";

import {
  EMPTY_BUILD,
  UsedItemBuildForm,
  type UsedItemBuildValue,
} from "@/components/used-items/used-item-build-form";

export default function UsedItemBuildPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<UsedItemBuildValue>(EMPTY_BUILD);

  const buildMutation = useMutation({
    mutationFn: () =>
      apiMutate<{ id: string; internalCode: string }>("/api/used-items/build", "POST", {
        displayName: form.displayName,
        productId: form.productId,
        spec: form.spec || null,
        memo: form.memo || null,
        imageUrls: form.imageUrls.length > 0 ? form.imageUrls : null,
        builtAt: form.builtAt,
        laborCost: parseComma(form.laborCost) || "0",
        issueSerial: form.issueSerial,
        warrantyMonths: form.issueSerial ? form.warrantyMonths : null,
        sourceUsedItemIds: form.sourceUsedItemIds,
        parts: form.parts
          .filter((p) => p.componentId && parseFloat(p.quantity) > 0)
          .map((p) => ({ componentId: p.componentId, quantity: p.quantity })),
      }),
    onSuccess: (created) => {
      toast.success(`조립품이 생성되었습니다 (${created.internalCode})`);
      queryClient.invalidateQueries({ queryKey: queryKeys.usedItems.all });
      router.push(`/inventory/used-items/${created.id}`);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "조립에 실패했습니다"),
  });

  const handleSubmit = () => {
    if (form.sourceUsedItemIds.length === 0) {
      toast.error("중고 재료를 1개 이상 선택해주세요");
      return;
    }
    if (!form.displayName.trim()) {
      toast.error("결과물 품명을 입력해주세요");
      return;
    }
    buildMutation.mutate();
  };

  return (
    <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--jm-border)] bg-[var(--jm-bg)] px-6 py-3">
        <Link href="/inventory/used-items">
          <JmIconButton aria-label="뒤로">
            <ArrowLeft />
          </JmIconButton>
        </Link>
        <div className="flex flex-col">
          <span className="text-jm-base font-semibold">중고 조립품 만들기</span>
          <span className="text-jm-xs text-[var(--jm-text-muted)]">
            여러 중고 + 신품 부품을 합쳐 새 단품 생성 (카탈로그 SKU 안 만듦)
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Link href="/inventory/used-items">
            <JmButton variant="ghost" size="sm">취소</JmButton>
          </Link>
          <JmButton
            variant="cta"
            size="sm"
            onClick={handleSubmit}
            disabled={buildMutation.isPending}
          >
            {buildMutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
            조립 생성
          </JmButton>
        </div>
      </div>

      <JmContainer width="default" padded={false} className="space-y-6 p-6">
        <UsedItemBuildForm value={form} onChange={setForm} />
      </JmContainer>
    </div>
  );
}
