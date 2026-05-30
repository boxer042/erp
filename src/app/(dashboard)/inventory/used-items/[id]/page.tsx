"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Trash2, FileText, Tag } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import {
  jmToast as toast,
  JmAlert,
  JmButton,
  JmCard,
  JmCardContent,
  JmCardHeader,
  JmCardTitle,
  JmContainer,
  JmDialog,
  JmDialogBody,
  JmDialogContent,
  JmDialogFooter,
  JmDialogHeader,
  JmDialogTitle,
  JmIconButton,
  JmInput,
  JmSkeleton,
  JmStat,
  JmTextarea,
} from "@/jm";

import {
  USED_ITEM_SOURCE_LABEL,
  totalUsedItemCost,
  daysInStock,
  usedItemName,
  type UsedItemDetail,
} from "@/components/used-items/_types";
import { UsedItemStatusBadge } from "@/components/used-items/used-item-status-badge";
import { UsedItemSourceBadge } from "@/components/used-items/used-item-source-badge";
import { UsedItemCostList } from "@/components/used-items/used-item-cost-list";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function UsedItemDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();

  const detailQuery = useQuery<UsedItemDetail>({
    queryKey: queryKeys.usedItems.detail(id),
    queryFn: () => apiGet<UsedItemDetail>(`/api/used-items/${id}`),
  });

  const [scrapOpen, setScrapOpen] = useState(false);
  const [scrapReason, setScrapReason] = useState("");
  const [issueSerialOpen, setIssueSerialOpen] = useState(false);
  const [warrantyMonths, setWarrantyMonths] = useState(0);

  const scrapMutation = useMutation({
    mutationFn: () =>
      apiMutate(`/api/used-items/${id}/scrap`, "POST", { reason: scrapReason }),
    onSuccess: () => {
      toast.success("폐기 처리되었습니다");
      setScrapOpen(false);
      setScrapReason("");
      queryClient.invalidateQueries({ queryKey: queryKeys.usedItems.all });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "폐기에 실패했습니다"),
  });

  const issueSerialMutation = useMutation({
    mutationFn: () =>
      apiMutate(`/api/used-items/${id}/issue-serial`, "POST", { warrantyMonths }),
    onSuccess: () => {
      toast.success("시리얼이 발번되었습니다");
      setIssueSerialOpen(false);
      setWarrantyMonths(0);
      queryClient.invalidateQueries({ queryKey: queryKeys.usedItems.all });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "발번에 실패했습니다"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiMutate(`/api/used-items/${id}`, "DELETE"),
    onSuccess: () => {
      toast.success("삭제되었습니다");
      queryClient.invalidateQueries({ queryKey: queryKeys.usedItems.all });
      router.push("/inventory/used-items");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "삭제에 실패했습니다"),
  });

  if (detailQuery.isPending) {
    return (
      <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--jm-border)] bg-[var(--jm-bg)] px-6 py-3">
          <JmSkeleton className="h-8 w-8 rounded-md" />
          <JmSkeleton className="h-6 w-48" />
        </div>
        <JmContainer width="default" padded={false} className="space-y-6 p-6">
          <JmSkeleton className="h-32 w-full rounded-2xl" />
          <JmSkeleton className="h-48 w-full rounded-2xl" />
        </JmContainer>
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-3 bg-[var(--jm-bg)] p-6">
        <p className="text-jm-base text-[var(--jm-text-muted)]">단품을 찾을 수 없습니다</p>
        <Link href="/inventory/used-items">
          <JmButton>목록으로</JmButton>
        </Link>
      </div>
    );
  }

  const item = detailQuery.data;
  const totalCost = totalUsedItemCost(item);
  const isLocked = item.status !== "IN_STOCK";

  return (
    <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--jm-border)] bg-[var(--jm-bg)] px-6 py-3">
        <Link href="/inventory/used-items">
          <JmIconButton aria-label="뒤로">
            <ArrowLeft />
          </JmIconButton>
        </Link>
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="text-jm-base font-semibold">{usedItemName(item)}</span>
            <UsedItemStatusBadge status={item.status} />
          </div>
          <span className="font-[family-name:var(--jm-font-mono)] text-jm-xs text-[var(--jm-text-muted)]">
            {item.internalCode}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {!isLocked && (
            <>
              {!item.serialItemId && (
                <JmButton
                  variant="outline"
                  size="sm"
                  onClick={() => setIssueSerialOpen(true)}
                >
                  <Tag className="size-3.5" />
                  시리얼 발번
                </JmButton>
              )}
              <JmButton
                variant="outline"
                size="sm"
                onClick={() => setScrapOpen(true)}
              >
                <Trash2 className="size-3.5" />
                폐기
              </JmButton>
              <JmButton
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (confirm("정말 삭제하시겠습니까? (보관 중 상태만 hard delete)")) {
                    deleteMutation.mutate();
                  }
                }}
                disabled={deleteMutation.isPending}
                className="text-[var(--jm-danger-fg)]"
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
                삭제
              </JmButton>
            </>
          )}
        </div>
      </div>

      <JmContainer width="default" padded={false} className="space-y-6 p-6">
        {/* KPI */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <JmStat
            label="매입가"
            value={`₩${parseFloat(item.acquiredCost).toLocaleString("ko-KR")}`}
          />
          <JmStat
            label="누적 비용"
            value={`₩${Math.round(totalCost).toLocaleString("ko-KR")}`}
          />
          <JmStat
            label="보관일"
            value={item.status === "IN_STOCK" ? `${daysInStock(item.acquiredAt)}일` : "—"}
          />
          <JmStat
            label="시리얼"
            value={item.serialItem?.code ?? "—"}
          />
        </div>

        {/* 매입 정보 */}
        <JmCard>
          <JmCardHeader>
            <JmCardTitle>매입 정보</JmCardTitle>
          </JmCardHeader>
          <JmCardContent>
            <dl className="grid grid-cols-1 gap-3 text-jm-sm sm:grid-cols-2">
              <div>
                <dt className="text-jm-xs text-[var(--jm-text-muted)]">출처</dt>
                <dd className="mt-0.5"><UsedItemSourceBadge source={item.acquiredFrom} /></dd>
              </div>
              <div>
                <dt className="text-jm-xs text-[var(--jm-text-muted)]">매입일</dt>
                <dd className="mt-0.5">
                  {format(new Date(item.acquiredAt), "yyyy년 M월 d일", { locale: ko })}
                </dd>
              </div>
              <div>
                <dt className="text-jm-xs text-[var(--jm-text-muted)]">매입가 (VAT 처리)</dt>
                <dd className="mt-0.5">
                  ₩{parseFloat(item.acquiredCost).toLocaleString("ko-KR")}
                  <span className="ml-2 text-jm-xs text-[var(--jm-text-muted)]">
                    {item.isAcquiredTaxable ? "세금계산서 받음" : "비과세 (개인 매입)"}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-jm-xs text-[var(--jm-text-muted)]">매입처</dt>
                <dd className="mt-0.5">
                  {item.sourceCustomer ? (
                    <Link
                      href={`/customers/${item.sourceCustomer.id}`}
                      className="text-[var(--jm-text)] hover:underline"
                    >
                      {item.sourceCustomer.name}
                    </Link>
                  ) : item.sourceMemo ? (
                    item.sourceMemo
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-jm-xs text-[var(--jm-text-muted)]">카탈로그 매칭</dt>
                <dd className="mt-0.5">
                  {item.product ? (
                    <Link
                      href={`/products/${item.product.id}`}
                      className="text-[var(--jm-text)] hover:underline"
                    >
                      {item.product.name} ({item.product.sku})
                    </Link>
                  ) : (
                    <span className="text-[var(--jm-text-muted)]">비카탈로그</span>
                  )}
                </dd>
              </div>
              {item.spec && (
                <div className="sm:col-span-2">
                  <dt className="text-jm-xs text-[var(--jm-text-muted)]">규격</dt>
                  <dd className="mt-0.5">{item.spec}</dd>
                </div>
              )}
              {item.memo && (
                <div className="sm:col-span-2">
                  <dt className="text-jm-xs text-[var(--jm-text-muted)]">메모</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap">{item.memo}</dd>
                </div>
              )}
            </dl>
          </JmCardContent>
        </JmCard>

        {/* 사진 */}
        {item.imageUrls && item.imageUrls.length > 0 && (
          <JmCard>
            <JmCardHeader>
              <JmCardTitle>사진</JmCardTitle>
            </JmCardHeader>
            <JmCardContent>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {item.imageUrls.map((url, idx) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative aspect-square overflow-hidden rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface-muted)]"
                  >
                    <Image
                      src={url}
                      alt={`사진 ${idx + 1}`}
                      fill
                      sizes="120px"
                      className="object-cover"
                      unoptimized
                    />
                  </a>
                ))}
              </div>
            </JmCardContent>
          </JmCard>
        )}

        {/* 비용 가산 */}
        <UsedItemCostList
          usedItemId={item.id}
          costs={item.addedCosts}
          disabled={isLocked}
        />

        {/* 중고 조립 결과물 — 재료 내역 (케이스 B) */}
        {item.buildAsResult && (
          <JmCard>
            <JmCardHeader>
              <JmCardTitle>조립 재료</JmCardTitle>
            </JmCardHeader>
            <JmCardContent className="space-y-2 text-jm-sm">
              <p className="text-jm-xs text-[var(--jm-text-muted)]">
                {format(new Date(item.buildAsResult.builtAt), "yyyy-MM-dd")} 조립 · 공임 ₩
                {parseFloat(item.buildAsResult.laborCost).toLocaleString("ko-KR")}
              </p>
              {item.buildAsResult.usedItemSources.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2">
                  <Link
                    href={`/inventory/used-items/${s.usedItem.id}`}
                    className="flex items-center gap-2 hover:underline"
                  >
                    <span className="rounded bg-[var(--jm-info-bg)] px-1.5 py-0.5 text-jm-2xs text-[var(--jm-info-fg)]">
                      중고
                    </span>
                    <span className="text-[var(--jm-text)]">
                      {s.usedItem.product?.name ?? s.usedItem.displayName}
                    </span>
                    <span className="font-[family-name:var(--jm-font-mono)] text-jm-xs text-[var(--jm-text-muted)]">
                      {s.usedItem.internalCode}
                    </span>
                  </Link>
                  <span className="shrink-0 tabular-nums text-[var(--jm-text-muted)]">
                    ₩{Math.round(parseFloat(s.costSnapshot)).toLocaleString("ko-KR")}
                  </span>
                </div>
              ))}
              {item.buildAsResult.partConsumptions.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-[var(--jm-surface-muted)] px-1.5 py-0.5 text-jm-2xs text-[var(--jm-text-muted)]">
                      신품
                    </span>
                    <span className="text-[var(--jm-text)]">{p.component.name}</span>
                    <span className="text-jm-xs text-[var(--jm-text-muted)]">
                      ×{parseFloat(p.quantity)}
                    </span>
                  </div>
                  <span className="shrink-0 tabular-nums text-[var(--jm-text-muted)]">
                    ₩{Math.round(parseFloat(p.unitCost) * parseFloat(p.quantity)).toLocaleString("ko-KR")}
                  </span>
                </div>
              ))}
            </JmCardContent>
          </JmCard>
        )}

        {/* lineage — 활용 history */}
        {(item.orderItem ||
          item.assemblyConsumption ||
          item.rentalAsset ||
          item.buildAsSource) && (
          <JmCard>
            <JmCardHeader>
              <JmCardTitle>활용 이력</JmCardTitle>
            </JmCardHeader>
            <JmCardContent className="space-y-2 text-jm-sm">
              {item.buildAsSource && (
                <div className="flex items-center gap-2">
                  <FileText className="size-4 text-[var(--jm-text-muted)]" />
                  <span className="text-[var(--jm-text-muted)]">조립 재료로 소진</span>
                  <Link
                    href={`/inventory/used-items/${item.buildAsSource.build.resultUsedItem.id}`}
                    className="text-[var(--jm-text)] hover:underline"
                  >
                    {item.buildAsSource.build.resultUsedItem.displayName}
                    <span className="ml-1 font-[family-name:var(--jm-font-mono)] text-jm-xs text-[var(--jm-text-muted)]">
                      {item.buildAsSource.build.resultUsedItem.internalCode}
                    </span>
                  </Link>
                </div>
              )}
              {item.assemblyConsumption && (
                <div className="flex items-center gap-2">
                  <FileText className="size-4 text-[var(--jm-text-muted)]" />
                  <span className="text-[var(--jm-text-muted)]">조립 흡수</span>
                  <Link
                    href={`/inventory/assembly?id=${item.assemblyConsumption.assembly.id}`}
                    className="text-[var(--jm-text)] hover:underline font-[family-name:var(--jm-font-mono)]"
                  >
                    {item.assemblyConsumption.assembly.assemblyNo}
                  </Link>
                  <span className="text-jm-xs text-[var(--jm-text-muted)]">
                    ({format(new Date(item.assemblyConsumption.assembly.assembledAt), "yyyy-MM-dd")})
                  </span>
                </div>
              )}
              {item.orderItem && (
                <div className="flex items-center gap-2">
                  <FileText className="size-4 text-[var(--jm-text-muted)]" />
                  <span className="text-[var(--jm-text-muted)]">단품 판매</span>
                  <Link
                    href={`/orders?id=${item.orderItem.orderId}`}
                    className="text-[var(--jm-text)] hover:underline font-[family-name:var(--jm-font-mono)]"
                  >
                    {item.orderItem.order.orderNo}
                  </Link>
                </div>
              )}
              {item.rentalAsset && (
                <div className="flex items-center gap-2">
                  <FileText className="size-4 text-[var(--jm-text-muted)]" />
                  <span className="text-[var(--jm-text-muted)]">임대 자산 출처</span>
                  <Link
                    href={`/rental-assets/${item.rentalAsset.id}`}
                    className="text-[var(--jm-text)] hover:underline"
                  >
                    {item.rentalAsset.assetNo} · {item.rentalAsset.name}
                  </Link>
                </div>
              )}
            </JmCardContent>
          </JmCard>
        )}

        {isLocked && (
          <JmAlert variant="info">
            이 단품은 {item.status === "SOLD" ? "판매 완료" : item.status === "ASSEMBLED_INTO" ? "조립에 흡수" : "폐기"} 상태로 잠금되어 있습니다. 비용 가산·수정 불가.
            {USED_ITEM_SOURCE_LABEL[item.acquiredFrom]}
          </JmAlert>
        )}
      </JmContainer>

      {/* 폐기 다이얼로그 */}
      <JmDialog open={scrapOpen} onOpenChange={setScrapOpen}>
        <JmDialogContent size="sm">
          <JmDialogHeader>
            <JmDialogTitle>중고 상품 폐기</JmDialogTitle>
          </JmDialogHeader>
          <JmDialogBody>
            <p className="text-jm-sm text-[var(--jm-text-muted)]">
              누적 비용 ₩{Math.round(totalCost).toLocaleString("ko-KR")} 이 자동으로 영업비용(Expense) 으로 기록됩니다.
            </p>
            <JmTextarea
              className="mt-3"
              value={scrapReason}
              onChange={(e) => setScrapReason(e.target.value)}
              placeholder="폐기 사유 (예: 수리 불능, 가치 없음)"
              rows={3}
            />
          </JmDialogBody>
          <JmDialogFooter>
            <JmButton variant="ghost" onClick={() => setScrapOpen(false)}>취소</JmButton>
            <JmButton
              variant="danger"
              onClick={() => scrapMutation.mutate()}
              disabled={scrapMutation.isPending || !scrapReason.trim()}
            >
              {scrapMutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
              폐기 처리
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>

      {/* 시리얼 발번 다이얼로그 */}
      <JmDialog open={issueSerialOpen} onOpenChange={setIssueSerialOpen}>
        <JmDialogContent size="sm">
          <JmDialogHeader>
            <JmDialogTitle>시리얼 라벨 발번</JmDialogTitle>
          </JmDialogHeader>
          <JmDialogBody>
            <p className="text-jm-sm text-[var(--jm-text-muted)]">
              단품 판매 가능 상태로 라벨을 발번합니다. 0 입력 시 보증 없음.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <JmInput
                type="number"
                min={0}
                max={120}
                value={String(warrantyMonths)}
                onChange={(e) =>
                  setWarrantyMonths(
                    Math.max(0, Math.min(120, parseInt(e.target.value, 10) || 0)),
                  )
                }
                className="w-32"
              />
              <span className="text-jm-sm text-[var(--jm-text-muted)]">개월</span>
            </div>
          </JmDialogBody>
          <JmDialogFooter>
            <JmButton variant="ghost" onClick={() => setIssueSerialOpen(false)}>
              취소
            </JmButton>
            <JmButton
              onClick={() => issueSerialMutation.mutate()}
              disabled={issueSerialMutation.isPending}
            >
              {issueSerialMutation.isPending && (
                <Loader2 className="size-3.5 animate-spin" />
              )}
              발번
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>
    </div>
  );
}
