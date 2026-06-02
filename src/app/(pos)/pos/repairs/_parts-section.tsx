"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, Package } from "lucide-react";
import { apiGet } from "@/lib/api-client";
import { JmBadge, JmCard, JmComboboxDrawer, JmInput, JmNumberInput } from "@/jm";
import { fmtKRWInc } from "./_helpers";
import type { RepairPart } from "./_types";
import { useRepairMutations } from "./_use-repair-mutations";
import { PosLineItemRow } from "@/components/pos/line-item-row";
import { BottomSheet } from "@/app/(pos)/pos/_components/bottom-sheet";
import { PriceInputDialog } from "@/app/(pos)/pos/_components/price-input-dialog";

interface ProductOption {
  id: string;
  name: string;
  sku: string;
  sellingPrice: string;
}

interface RecommendedPart {
  productId: string;
  name: string;
  sku: string;
  sellingPrice: string;
  occurrenceCount: number;
}

interface Props {
  ticketId: string;
  parts: RepairPart[];
  readonly: boolean;
  /** 호환용 — 새 섹션은 optimistic 훅이 캐시를 직접 patch 하므로 사용 안 함 */
  onChanged?: () => void;
  diagnosisTemplateId?: string | null;
}

/**
 * 부속 섹션 (가로카드 리뉴얼) — 추천을 정사각 가로카드로 전면화 + 1탭 추가.
 * [+추가] 카드 = 검색 드로워(롱테일). 추가된 부속은 아래 목록. 모두 optimistic.
 *
 * Phase C 에서 [+추가] 가 [직접추가(자유부속)] + [검색] 으로 분화 예정.
 */
export function PartsSection({ ticketId, parts, readonly, diagnosisTemplateId }: Props) {
  const m = useRepairMutations(ticketId);
  const [picker, setPicker] = useState(false);
  const [addFreeOpen, setAddFreeOpen] = useState(false);

  const productsQuery = useQuery({
    queryKey: ["repairs", "products"],
    queryFn: () => apiGet<ProductOption[]>(`/api/products?isBulk=all&excludeVariants=true`),
    enabled: picker,
    staleTime: 1000 * 60 * 5,
  });

  const recommendationsQuery = useQuery<{ parts: RecommendedPart[] }>({
    queryKey: ["repairs", "diagnosis-recommendations", diagnosisTemplateId],
    queryFn: () =>
      apiGet<{ parts: RecommendedPart[]; labors: unknown[] }>(
        `/api/repair-diagnosis-templates/${diagnosisTemplateId}/recommendations`,
      ),
    enabled: !!diagnosisTemplateId && !readonly,
    staleTime: 1000 * 60,
  });

  const addedProductIds = new Set(parts.map((p) => p.productId));
  const recs = (recommendationsQuery.data?.parts ?? []).filter(
    (r) => !addedProductIds.has(r.productId),
  );

  const usedTotal = parts
    .filter((p) => p.status === "USED")
    .reduce((s, p) => s + Number(p.totalPrice), 0);
  const lostTotal = parts
    .filter((p) => p.status === "LOST")
    .reduce((s, p) => s + Number(p.totalPrice), 0);

  const add = (p: { id: string; name: string; sku: string; sellingPrice: string }) =>
    m.addPart.mutate({
      productId: p.id,
      name: p.name,
      sku: p.sku,
      quantity: 1,
      unitPrice: parseFloat(p.sellingPrice) || 0,
    });

  return (
    <>
      <JmCard className="overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 sm:px-5">
          <div className="flex items-baseline gap-2">
            <span className="text-jm-base font-semibold text-[var(--jm-text)]">부속</span>
            <span className="text-jm-2xs text-[var(--jm-text-subtle)]">
              {parts.length === 0 ? "여러 개" : `${parts.length}건`}
            </span>
          </div>
          {diagnosisTemplateId && recs.length > 0 && (
            <span className="text-jm-2xs text-[var(--jm-text-subtle)]">진단 추천순</span>
          )}
        </div>

        {/* 가로 카드 — [+직접추가] + 추천(정사각, 1탭) + [🔍 검색] (D7) */}
        {!readonly && (
          <div className="flex gap-2 overflow-x-auto px-4 pb-3 sm:px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {/* 맨 앞: 직접추가 (자유부속 모달 — 이름+규격+가격) */}
            <button
              type="button"
              onClick={() => setAddFreeOpen(true)}
              className="flex h-[88px] w-[76px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] transition-colors active:bg-[var(--jm-border)]"
            >
              <Plus className="size-5" />
              <span className="text-jm-2xs font-medium">직접추가</span>
            </button>

            {recs.map((r) => (
              <button
                key={r.productId}
                type="button"
                disabled={m.addPart.isPending}
                onClick={() => add({ id: r.productId, name: r.name, sku: r.sku, sellingPrice: r.sellingPrice })}
                className="relative flex h-[88px] w-[76px] shrink-0 flex-col items-center justify-between rounded-xl border border-[var(--jm-border)] bg-[var(--jm-surface)] p-1.5 text-center transition-colors active:bg-[var(--jm-surface-muted)] disabled:opacity-50"
              >
                <span className="absolute right-1 top-1 rounded bg-[var(--jm-accent-bg)] px-1 text-jm-3xs font-semibold text-[var(--jm-accent-fg)]">
                  {r.occurrenceCount}
                </span>
                <Package className="size-5 shrink-0 text-[var(--jm-text-muted)]" />
                <span className="line-clamp-2 text-jm-3xs leading-tight text-[var(--jm-text)]">
                  {r.name}
                </span>
                <span className="text-jm-3xs font-semibold tabular-nums text-[var(--jm-text-muted)]">
                  {fmtKRWInc(parseFloat(r.sellingPrice) || 0)}
                </span>
              </button>
            ))}

            {/* 끝: 카탈로그 검색 (롱테일) */}
            <button
              type="button"
              onClick={() => setPicker(true)}
              className="flex h-[88px] w-[76px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] transition-colors active:bg-[var(--jm-border)]"
            >
              <Search className="size-5" />
              <span className="text-jm-2xs font-medium">검색</span>
            </button>
          </div>
        )}

        {/* 추가됨 목록 */}
        {parts.length > 0 && (
          <div className="flex flex-col border-t border-[var(--jm-border)]">
            {parts.map((p) => (
              <PartRow key={p.id} part={p} readonly={readonly} m={m} />
            ))}
          </div>
        )}

        {/* 합계 */}
        {parts.length > 0 && (
          <div className="flex items-center justify-end gap-4 border-t border-[var(--jm-border)] px-4 py-3 text-jm-sm sm:px-5">
            {lostTotal > 0 && (
              <span className="text-[var(--jm-danger-fg)]">손실 −{fmtKRWInc(lostTotal)}</span>
            )}
            <span className="font-semibold tabular-nums text-[var(--jm-text)]">
              청구 {fmtKRWInc(usedTotal)}
            </span>
          </div>
        )}
      </JmCard>

      {/* 검색 드로워 — 롱테일 (모바일 가상 키보드 안 가림) */}
      <JmComboboxDrawer<ProductOption>
        open={picker}
        onOpenChange={setPicker}
        items={productsQuery.data ?? []}
        loading={productsQuery.isPending}
        getKey={(p) => p.id}
        title="부속 검색"
        placeholder="상품명 또는 SKU 검색"
        filterFn={(p, q) =>
          p.name.toLowerCase().includes(q.toLowerCase()) ||
          p.sku.toLowerCase().includes(q.toLowerCase())
        }
        renderItem={(p) => (
          <div className="flex w-full items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col">
              <span className="line-clamp-1 text-jm-sm font-medium text-[var(--jm-text)]">
                {p.name}
              </span>
              <span className="font-mono text-jm-2xs text-[var(--jm-text-subtle)]">{p.sku}</span>
            </div>
            <span className="shrink-0 text-jm-sm font-semibold tabular-nums text-[var(--jm-text)]">
              {fmtKRWInc(parseFloat(p.sellingPrice) || 0)}
            </span>
          </div>
        )}
        onSelect={(p) => {
          add({ id: p.id, name: p.name, sku: p.sku, sellingPrice: p.sellingPrice });
          setPicker(false);
        }}
      />

      {/* 자유부속 직접추가 — 미등록 부속(이름+규격+가격). 재고 미차감 → /presale 정산 */}
      {addFreeOpen && (
        <FreePartAddSheet
          onClose={() => setAddFreeOpen(false)}
          onAdd={(name, spec, unitPrice) => {
            m.addPart.mutate({ name, spec, presaleKind: "used", quantity: 1, unitPrice });
            setAddFreeOpen(false);
          }}
        />
      )}
    </>
  );
}

function FreePartAddSheet({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (name: string, spec: string | null, unitPrice: number) => void;
}) {
  const [name, setName] = useState("");
  const [spec, setSpec] = useState("");
  const [price, setPrice] = useState("");
  const canAdd = name.trim().length > 0 && !!price;

  return (
    <BottomSheet
      open
      onOpenChange={(v) => !v && onClose()}
      title="미등록 부속 직접 추가"
      footer={
        <button
          type="button"
          disabled={!canAdd}
          onClick={() => onAdd(name.trim(), spec.trim() || null, parseInt(price.replace(/,/g, ""), 10) || 0)}
          className="h-14 w-full rounded-2xl bg-[var(--jm-action)] text-jm-lg font-semibold text-white transition-transform active:scale-[0.99] disabled:opacity-50"
        >
          추가
        </button>
      }
    >
      <div className="flex flex-col gap-3 pt-2">
        <JmInput autoFocus size="md" value={name} onChange={(e) => setName(e.target.value)} placeholder="부속명 (예: 중고 기화기)" />
        <JmInput size="md" value={spec} onChange={(e) => setSpec(e.target.value)} placeholder="규격 (선택)" />
        <JmNumberInput value={price} onValueChange={setPrice} placeholder="₩ 가격 (공급가액)" />
        <p className="text-jm-2xs text-[var(--jm-text-muted)]">
          재고에 없는 부속 — 손님 청구는 지금, 원가는 결제 후 [선판매]에서 정산. 항상 과세(VAT 10%).
        </p>
      </div>
    </BottomSheet>
  );
}

function PartRow({
  part,
  readonly,
  m,
}: {
  part: RepairPart;
  readonly: boolean;
  m: ReturnType<typeof useRepairMutations>;
}) {
  const [priceOpen, setPriceOpen] = useState(false);
  const [totalOpen, setTotalOpen] = useState(false);
  const isLost = part.status === "LOST";
  const isFree = !part.productId;
  const displayName = part.product?.name ?? part.name ?? "부속";
  const displaySku = part.product?.sku ?? (part.spec || "");

  return (
    <>
      <PosLineItemRow
        className={isLost ? "sm:px-5 opacity-60" : "sm:px-5"}
        name={displayName}
        nameStrikethrough={isLost && !part.billLost}
        sku={displaySku}
        headerEnd={
          readonly ? undefined : (
            <>
              {isFree && (
                <JmBadge variant="success" size="sm">
                  선판매
                </JmBadge>
              )}
              {isLost && (
                <button
                  type="button"
                  onClick={() => m.updatePart.mutate({ partId: part.id, billLost: !part.billLost })}
                  title={part.billLost ? "고객 청구 — 합계 포함" : "회사 손실 — 합계 미포함"}
                  className="appearance-none border-0 bg-transparent p-0"
                >
                  <JmBadge variant={part.billLost ? "warning" : "default"} size="sm">
                    {part.billLost ? "청구" : "손실"}
                  </JmBadge>
                </button>
              )}
              <button
                type="button"
                onClick={() => m.updatePart.mutate({ partId: part.id, status: isLost ? "USED" : "LOST" })}
                className="appearance-none border-0 bg-transparent p-0"
              >
                <JmBadge variant={isLost ? "danger" : "success"} size="sm">
                  {isLost ? "LOST" : "USED"}
                </JmBadge>
              </button>
            </>
          )
        }
        onDelete={readonly ? undefined : () => m.deletePart.mutate(part.id)}
        deleteDisabled={m.deletePart.isPending}
        unitPrice={fmtKRWInc(part.unitPrice)}
        onUnitPriceClick={readonly ? undefined : () => setPriceOpen(true)}
        quantity={{
          value: Number(part.quantity),
          onChange: (next) => {
            if (next !== Number(part.quantity)) m.updatePart.mutate({ partId: part.id, quantity: next });
          },
        }}
        total={fmtKRWInc(part.totalPrice)}
        onTotalClick={readonly ? undefined : () => setTotalOpen(true)}
        disabled={readonly}
      />

      <PriceInputDialog
        open={priceOpen}
        onOpenChange={setPriceOpen}
        title={displayName}
        initialNet={Number(part.unitPrice) || 0}
        taxType="TAXABLE"
        onSubmit={(net) => m.updatePart.mutate({ partId: part.id, unitPrice: net })}
      />
      <PriceInputDialog
        open={totalOpen}
        onOpenChange={setTotalOpen}
        title={`${displayName} — 라인 합계`}
        initialNet={Number(part.totalPrice) || 0}
        taxType="TAXABLE"
        allowService={false}
        onSubmit={(netTotal) => {
          const q = Math.max(1, Number(part.quantity) || 1);
          m.updatePart.mutate({ partId: part.id, unitPrice: Math.round(netTotal / q) });
        }}
      />
    </>
  );
}
