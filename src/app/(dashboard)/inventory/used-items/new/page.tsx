"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";

import { apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import {
  jmToast as toast,
  JmButton,
  JmContainer,
  JmIconButton,
} from "@/jm";

import {
  EMPTY_USED_ITEM_FORM,
  UsedItemForm,
  type UsedItemFormValue,
} from "@/components/used-items/used-item-form";

export default function NewUsedItemPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<UsedItemFormValue>(EMPTY_USED_ITEM_FORM);

  const createMutation = useMutation({
    mutationFn: () =>
      apiMutate<{ id: string; internalCode: string }>("/api/used-items", "POST", {
        displayName: form.displayName,
        productId: form.productId,
        acquiredFrom: form.acquiredFrom,
        acquiredCost: form.acquiredCost || "0",
        isAcquiredTaxable: form.isAcquiredTaxable,
        acquiredAt: form.acquiredAt,
        sourceCustomerId: form.sourceCustomerId,
        sourceMemo: form.sourceMemo || null,
        spec: form.spec || null,
        imageUrls: form.imageUrls.length > 0 ? form.imageUrls : null,
        memo: form.memo || null,
        issueSerial: form.issueSerial,
        warrantyMonths: form.issueSerial ? form.warrantyMonths : null,
      }),
    onSuccess: (created) => {
      toast.success(`중고 상품이 등록되었습니다 (${created.internalCode})`);
      queryClient.invalidateQueries({ queryKey: queryKeys.usedItems.all });
      router.push(`/inventory/used-items/${created.id}`);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "등록에 실패했습니다"),
  });

  const handleSubmit = () => {
    if (!form.displayName.trim()) {
      toast.error("품명을 입력해주세요");
      return;
    }
    if (!form.acquiredAt) {
      toast.error("매입일을 입력해주세요");
      return;
    }
    createMutation.mutate();
  };

  return (
    <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
      {/* 스티키 헤더 */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--jm-border)] bg-[var(--jm-bg)] px-6 py-3">
        <Link href="/inventory/used-items">
          <JmIconButton aria-label="뒤로">
            <ArrowLeft />
          </JmIconButton>
        </Link>
        <span className="text-jm-base font-semibold">중고 상품 매입 등록</span>
        <div className="ml-auto flex items-center gap-1.5">
          <Link href="/inventory/used-items">
            <JmButton variant="ghost" size="sm">취소</JmButton>
          </Link>
          <JmButton
            variant="cta"
            size="sm"
            onClick={handleSubmit}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
            등록
          </JmButton>
        </div>
      </div>

      <JmContainer width="default" padded={false} className="space-y-6 p-6">
        <UsedItemForm value={form} onChange={setForm} />
      </JmContainer>
    </div>
  );
}
