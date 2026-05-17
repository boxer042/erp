"use client";

import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import {
  JmBadge,
  JmButton,
  JmDrawer,
  JmDrawerContent,
  JmDrawerHeader,
  JmDrawerTitle,
  JmSkeleton,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
} from "@/jm";

interface ConsumptionLot {
  id: string;
  receivedAt: string;
  source: string;
  remainingQty: string;
  receivedQty: string;
  unitCost: string;
}

interface ConsumptionItem {
  id: string;
  componentId: string;
  lotId: string;
  quantity: string;
  unitCost: string;
  component: { id: string; name: string; sku: string };
  lot: ConsumptionLot | null;
}

interface AssemblyDetail {
  id: string;
  assemblyNo: string;
  productId: string;
  product: {
    id: string;
    name: string;
    sku: string;
    isCanonical: boolean;
    canonicalProductId: string | null;
    canonicalProduct: { id: string; name: string; sku: string } | null;
  };
  quantity: string;
  type: "PRODUCE" | "DISASSEMBLE";
  laborCost: string | null;
  assembledAt: string;
  memo: string | null;
  producedLotId: string | null;
  producedLot: ConsumptionLot | null;
  reverseOfId: string | null;
  reverseOf: { id: string; assemblyNo: string; assembledAt: string } | null;
  reversedBy: { id: string; assemblyNo: string; assembledAt: string } | null;
  consumptions: ConsumptionItem[];
}

const LOT_SOURCE_LABEL: Record<string, string> = {
  INCOMING: "입고",
  INITIAL: "기초",
  ADJUSTMENT: "조정",
  SET_PRODUCE: "조립 생산",
};

interface AssemblyDetailSheetProps {
  assemblyId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AssemblyDetailSheet({
  assemblyId,
  open,
  onOpenChange,
}: AssemblyDetailSheetProps) {
  const detailQuery = useQuery({
    queryKey: queryKeys.assembly.detail(assemblyId ?? ""),
    queryFn: () => apiGet<AssemblyDetail>(`/api/assemblies/${assemblyId}`),
    enabled: open && !!assemblyId,
  });
  const data = detailQuery.data ?? null;
  const loading = detailQuery.isPending && open && !!assemblyId;

  const totalComponentCost = data
    ? data.consumptions.reduce(
        (sum, c) => sum + Number(c.quantity) * Number(c.unitCost),
        0,
      )
    : 0;
  const laborCostNum = data?.laborCost ? Number(data.laborCost) : 0;
  const totalCost = totalComponentCost + laborCostNum;
  const quantityNum = data ? Number(data.quantity) : 0;
  const finishedUnitCost = quantityNum > 0 ? totalCost / quantityNum : 0;

  const isVariant = data?.product.canonicalProductId != null;

  return (
    <JmDrawer open={open} onOpenChange={onOpenChange}>
      <JmDrawerContent
        side="bottom"
        size="xl"
        className="flex flex-col p-0"
        dragHandle={false}
      >
        <JmDrawerHeader className="border-b border-[var(--jm-border)] px-5 py-4 flex-shrink-0">
          <JmDrawerTitle className="flex items-center gap-2">
            <span>조립 실적 상세</span>
            {data && (
              <span className="font-[family-name:var(--jm-font-mono)] text-jm-sm text-[var(--jm-text-muted)]">
                {data.assemblyNo}
              </span>
            )}
            {data && (
              <JmBadge
                variant={data.type === "PRODUCE" ? "info" : "danger"}
                size="sm"
                shape="square"
              >
                {data.type === "PRODUCE" ? "조립" : "역조립"}
              </JmBadge>
            )}
          </JmDrawerTitle>
        </JmDrawerHeader>

        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5 space-y-6">
            {loading || !data ? (
              <DetailSkeleton />
            ) : (
              <>
                <Section title="기본 정보">
                  <InfoGrid
                    items={[
                      {
                        label: "조립일",
                        value: format(new Date(data.assembledAt), "yyyy-MM-dd"),
                      },
                      {
                        label: "수량",
                        value: `${Number(data.quantity).toLocaleString("ko-KR")}`,
                      },
                      {
                        label: "조립비",
                        value: data.laborCost
                          ? `₩${Number(data.laborCost).toLocaleString("ko-KR")}`
                          : "-",
                      },
                      {
                        label: "메모",
                        value: data.memo ?? "-",
                        colSpan: 3,
                      },
                    ]}
                  />
                </Section>

                <Section title="조립 상품">
                  <div className="rounded-lg border border-[var(--jm-border)] p-4 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-[var(--jm-text)]">
                        {data.product.name}
                      </span>
                      <JmBadge
                        variant="outline"
                        size="sm"
                        shape="square"
                        className="font-[family-name:var(--jm-font-mono)]"
                      >
                        {data.product.sku}
                      </JmBadge>
                      {isVariant ? (
                        <JmBadge variant="default" size="sm" shape="square">
                          변형
                        </JmBadge>
                      ) : data.product.isCanonical ? (
                        <JmBadge variant="default" size="sm" shape="square">
                          기본 모델
                        </JmBadge>
                      ) : (
                        <JmBadge variant="default" size="sm" shape="square">
                          단일 상품
                        </JmBadge>
                      )}
                    </div>
                    {isVariant && data.product.canonicalProduct && (
                      <div className="text-jm-xs text-[var(--jm-text-muted)]">
                        부모 모델: {data.product.canonicalProduct.name}{" "}
                        <span className="font-[family-name:var(--jm-font-mono)]">
                          ({data.product.canonicalProduct.sku})
                        </span>
                      </div>
                    )}
                  </div>
                </Section>

                <Section
                  title="구성품 소비 내역"
                  description={`총 ${data.consumptions.length}개 로트에서 소비됨`}
                >
                  {data.consumptions.length === 0 ? (
                    <div className="rounded-lg border border-[var(--jm-border)] p-4 text-jm-sm text-[var(--jm-text-muted)]">
                      소비 내역이 없습니다 (역조립 실적은 원본 조립의 내역을 참조하세요)
                    </div>
                  ) : (
                    <div className="rounded-lg border border-[var(--jm-border)] overflow-hidden">
                      <JmTable>
                        <JmTableHeader>
                          <JmTableRow className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-xs hover:bg-[var(--jm-surface-muted)]">
                            <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
                              구성품
                            </JmTableHead>
                            <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
                              소비 로트
                            </JmTableHead>
                            <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 text-right font-medium">
                              수량
                            </JmTableHead>
                            <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 text-right font-medium">
                              단가
                            </JmTableHead>
                            <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 text-right font-medium">
                              합계
                            </JmTableHead>
                          </JmTableRow>
                        </JmTableHeader>
                        <JmTableBody>
                          {data.consumptions.map((c) => {
                            const qty = Number(c.quantity);
                            const unit = Number(c.unitCost);
                            return (
                              <JmTableRow key={c.id}>
                                <JmTableCell className="px-3 py-2">
                                  <div className="flex flex-col">
                                    <span className="text-[var(--jm-text)]">
                                      {c.component.name}
                                    </span>
                                    <span className="text-jm-xs text-[var(--jm-text-muted)] font-[family-name:var(--jm-font-mono)]">
                                      {c.component.sku}
                                    </span>
                                  </div>
                                </JmTableCell>
                                <JmTableCell className="px-3 py-2">
                                  {c.lot ? (
                                    <div className="flex flex-col">
                                      <span className="text-jm-xs">
                                        {format(new Date(c.lot.receivedAt), "yyyy-MM-dd")}{" "}
                                        <JmBadge
                                          variant="outline"
                                          size="sm"
                                          shape="square"
                                          className="ml-1 text-jm-2xs"
                                        >
                                          {LOT_SOURCE_LABEL[c.lot.source] ?? c.lot.source}
                                        </JmBadge>
                                      </span>
                                      <span className="text-jm-2xs text-[var(--jm-text-muted)] font-[family-name:var(--jm-font-mono)]">
                                        {c.lotId.slice(0, 8)}
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-jm-xs text-[var(--jm-text-muted)]">
                                      -
                                    </span>
                                  )}
                                </JmTableCell>
                                <JmTableCell className="px-3 py-2 text-right tabular-nums text-[var(--jm-text)]">
                                  {qty.toLocaleString("ko-KR")}
                                </JmTableCell>
                                <JmTableCell className="px-3 py-2 text-right tabular-nums text-[var(--jm-text)]">
                                  ₩
                                  {unit.toLocaleString("ko-KR", {
                                    maximumFractionDigits: 2,
                                  })}
                                </JmTableCell>
                                <JmTableCell className="px-3 py-2 text-right tabular-nums text-[var(--jm-text)]">
                                  ₩
                                  {(qty * unit).toLocaleString("ko-KR", {
                                    maximumFractionDigits: 0,
                                  })}
                                </JmTableCell>
                              </JmTableRow>
                            );
                          })}
                        </JmTableBody>
                      </JmTable>
                    </div>
                  )}
                </Section>

                {data.type === "PRODUCE" && data.consumptions.length > 0 && (
                  <Section title="원가 요약">
                    <div className="rounded-lg border border-[var(--jm-border)] divide-y divide-[var(--jm-border)] text-jm-sm">
                      <CostRow
                        label="구성품 원가 합계"
                        value={`₩${Math.round(totalComponentCost).toLocaleString("ko-KR")}`}
                      />
                      <CostRow
                        label="조립비"
                        value={`₩${Math.round(laborCostNum).toLocaleString("ko-KR")}`}
                      />
                      <CostRow
                        label="총 원가"
                        value={`₩${Math.round(totalCost).toLocaleString("ko-KR")}`}
                        bold
                      />
                      <CostRow
                        label="단위당 원가"
                        value={`₩${Math.round(finishedUnitCost).toLocaleString("ko-KR")}`}
                      />
                    </div>
                  </Section>
                )}

                {data.producedLot && (
                  <Section title="완제품 로트">
                    <div className="rounded-lg border border-[var(--jm-border)] p-4">
                      <InfoGrid
                        items={[
                          {
                            label: "생성일",
                            value: format(new Date(data.producedLot.receivedAt), "yyyy-MM-dd"),
                          },
                          {
                            label: "생산 수량",
                            value: Number(data.producedLot.receivedQty).toLocaleString("ko-KR"),
                          },
                          {
                            label: "잔여 수량",
                            value: Number(data.producedLot.remainingQty).toLocaleString(
                              "ko-KR",
                            ),
                          },
                          {
                            label: "단가",
                            value: `₩${Math.round(Number(data.producedLot.unitCost)).toLocaleString("ko-KR")}`,
                          },
                        ]}
                      />
                    </div>
                  </Section>
                )}

                {(data.reverseOf || data.reversedBy) && (
                  <Section title="역조립 관계">
                    <div className="rounded-lg border border-[var(--jm-border)] p-4 text-jm-sm space-y-1 text-[var(--jm-text)]">
                      {data.reverseOf && (
                        <div>
                          원본 조립:{" "}
                          <span className="font-[family-name:var(--jm-font-mono)]">
                            {data.reverseOf.assemblyNo}
                          </span>{" "}
                          <span className="text-jm-xs text-[var(--jm-text-muted)]">
                            ({format(new Date(data.reverseOf.assembledAt), "yyyy-MM-dd")})
                          </span>
                        </div>
                      )}
                      {data.reversedBy && (
                        <div>
                          역조립됨:{" "}
                          <span className="font-[family-name:var(--jm-font-mono)]">
                            {data.reversedBy.assemblyNo}
                          </span>{" "}
                          <span className="text-jm-xs text-[var(--jm-text-muted)]">
                            ({format(new Date(data.reversedBy.assembledAt), "yyyy-MM-dd")})
                          </span>
                        </div>
                      )}
                    </div>
                  </Section>
                )}
              </>
            )}
          </div>

          <div className="border-t border-[var(--jm-border)] px-5 py-4 flex justify-end bg-[var(--jm-bg)]">
            <JmButton variant="outline" onClick={() => onOpenChange(false)}>
              닫기
            </JmButton>
          </div>
        </div>
      </JmDrawerContent>
    </JmDrawer>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-jm-sm font-semibold text-[var(--jm-text)]">{title}</h3>
        {description && (
          <p className="text-jm-xs text-[var(--jm-text-muted)]">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function InfoGrid({
  items,
}: {
  items: Array<{ label: string; value: string; colSpan?: number }>;
}) {
  return (
    <div className="grid grid-cols-3 gap-x-4 gap-y-3 text-jm-sm">
      {items.map((item, i) => (
        <div
          key={i}
          style={item.colSpan ? { gridColumn: `span ${item.colSpan}` } : undefined}
        >
          <div className="text-jm-xs text-[var(--jm-text-muted)]">{item.label}</div>
          <div className="mt-0.5 whitespace-pre-wrap break-words text-[var(--jm-text)]">
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function CostRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2">
      <span
        className={
          bold
            ? "font-semibold text-[var(--jm-text)]"
            : "text-[var(--jm-text-muted)]"
        }
      >
        {label}
      </span>
      <span className={bold ? "font-semibold text-[var(--jm-text)]" : "text-[var(--jm-text)]"}>
        {value}
      </span>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <JmSkeleton className="h-4 w-20" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <JmSkeleton className="h-3 w-12" />
              <JmSkeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <JmSkeleton className="h-4 w-20" />
        <JmSkeleton className="h-20 w-full" />
      </div>
      <div className="space-y-2">
        <JmSkeleton className="h-4 w-24" />
        <JmSkeleton className="h-32 w-full" />
      </div>
    </div>
  );
}
