"use client";

import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="p-0 flex flex-col"
        style={{ height: "85vh", maxHeight: "85vh" }}
      >
        <SheetHeader className="border-b border-border px-5 py-4 flex-shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <span>조립 실적 상세</span>
            {data && (
              <span className="font-mono text-sm text-muted-foreground">
                {data.assemblyNo}
              </span>
            )}
            {data && (
              <Badge variant={data.type === "PRODUCE" ? "default" : "destructive"}>
                {data.type === "PRODUCE" ? "조립" : "역조립"}
              </Badge>
            )}
          </SheetTitle>
        </SheetHeader>

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
                <div className="rounded-lg border border-border p-4 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{data.product.name}</span>
                    <Badge variant="outline" className="font-mono">
                      {data.product.sku}
                    </Badge>
                    {isVariant ? (
                      <Badge variant="secondary">변형</Badge>
                    ) : data.product.isCanonical ? (
                      <Badge variant="secondary">기본 모델</Badge>
                    ) : (
                      <Badge variant="secondary">단일 상품</Badge>
                    )}
                  </div>
                  {isVariant && data.product.canonicalProduct && (
                    <div className="text-xs text-muted-foreground">
                      부모 모델: {data.product.canonicalProduct.name}{" "}
                      <span className="font-mono">
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
                  <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                    소비 내역이 없습니다 (역조립 실적은 원본 조립의 내역을 참조하세요)
                  </div>
                ) : (
                  <div className="rounded-lg border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>구성품</TableHead>
                          <TableHead>소비 로트</TableHead>
                          <TableHead className="text-right">수량</TableHead>
                          <TableHead className="text-right">단가</TableHead>
                          <TableHead className="text-right">합계</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.consumptions.map((c) => {
                          const qty = Number(c.quantity);
                          const unit = Number(c.unitCost);
                          return (
                            <TableRow key={c.id}>
                              <TableCell>
                                <div className="flex flex-col">
                                  <span>{c.component.name}</span>
                                  <span className="text-xs text-muted-foreground font-mono">
                                    {c.component.sku}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>
                                {c.lot ? (
                                  <div className="flex flex-col">
                                    <span className="text-xs">
                                      {format(new Date(c.lot.receivedAt), "yyyy-MM-dd")}{" "}
                                      <Badge variant="outline" className="ml-1 text-[10px]">
                                        {LOT_SOURCE_LABEL[c.lot.source] ?? c.lot.source}
                                      </Badge>
                                    </span>
                                    <span className="text-[10px] text-muted-foreground font-mono">
                                      {c.lotId.slice(0, 8)}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                {qty.toLocaleString("ko-KR")}
                              </TableCell>
                              <TableCell className="text-right">
                                ₩{unit.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}
                              </TableCell>
                              <TableCell className="text-right">
                                ₩
                                {(qty * unit).toLocaleString("ko-KR", {
                                  maximumFractionDigits: 0,
                                })}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Section>

              {data.type === "PRODUCE" && data.consumptions.length > 0 && (
                <Section title="원가 요약">
                  <div className="rounded-lg border border-border divide-y divide-border text-sm">
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
                  <div className="rounded-lg border border-border p-4">
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
                          value: Number(data.producedLot.remainingQty).toLocaleString("ko-KR"),
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
                  <div className="rounded-lg border border-border p-4 text-sm space-y-1">
                    {data.reverseOf && (
                      <div>
                        원본 조립:{" "}
                        <span className="font-mono">{data.reverseOf.assemblyNo}</span>{" "}
                        <span className="text-xs text-muted-foreground">
                          ({format(new Date(data.reverseOf.assembledAt), "yyyy-MM-dd")})
                        </span>
                      </div>
                    )}
                    {data.reversedBy && (
                      <div>
                        역조립됨:{" "}
                        <span className="font-mono">{data.reversedBy.assemblyNo}</span>{" "}
                        <span className="text-xs text-muted-foreground">
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

          <div className="border-t border-border px-5 py-4 flex justify-end bg-background">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              닫기
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
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
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
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
    <div className="grid grid-cols-3 gap-x-4 gap-y-3 text-sm">
      {items.map((item, i) => (
        <div
          key={i}
          style={item.colSpan ? { gridColumn: `span ${item.colSpan}` } : undefined}
        >
          <div className="text-xs text-muted-foreground">{item.label}</div>
          <div className="mt-0.5 whitespace-pre-wrap break-words">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function CostRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-2">
      <span className={bold ? "font-semibold" : "text-muted-foreground"}>{label}</span>
      <span className={bold ? "font-semibold" : ""}>{value}</span>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-20 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  );
}
