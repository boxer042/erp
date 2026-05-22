"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";

import { focusCaretEnd } from "@/jm/lib/focus";
import { ApiError, apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { formatComma, parseComma } from "@/lib/utils";
import {
  syncChannelPricings,
  updateProductFields,
  type ChannelPriceState,
  type ProductFieldsInput,
} from "@/lib/product-mutations";
import {
  JmBadge,
  JmButton,
  JmCheckbox,
  JmDrawer,
  JmDrawerContent,
  JmDrawerDescription,
  JmDrawerHeader,
  JmDrawerTitle,
  JmInput,
} from "@/jm";
import { summarizeCosts, toVatPrice } from "../helpers";
import type { ProductDetail } from "../types";
import { ProductCostsEditSheet } from "./product-costs-edit-sheet";
import { PriceInputDialog } from "@/app/(pos)/pos/_components/price-input-dialog";

interface Channel {
  id: string;
  name: string;
  code: string;
}

interface ProductChannelPricingEditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductDetail;
}

export function ProductChannelPricingEditSheet(
  props: ProductChannelPricingEditSheetProps,
) {
  return (
    <JmDrawer open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && <ProductChannelPricingEditSheetContent {...props} />}
    </JmDrawer>
  );
}

interface RowState {
  channelId: string;
  enabled: boolean;
  vatPrice: string;
}

function ProductChannelPricingEditSheetContent({
  onOpenChange,
  product,
}: ProductChannelPricingEditSheetProps) {
  const queryClient = useQueryClient();

  const channelsQuery = useQuery({
    queryKey: queryKeys.channels.list(),
    queryFn: () => apiGet<Channel[]>("/api/channels"),
  });

  const taxRate = parseFloat(product.taxRate ?? "0.1");
  const isTaxable = product.taxType !== "TAX_FREE";
  // 영세율 가능 상품이라도 정가/판매가 VAT 표시는 taxType 만 보고 결정. 세액은 0 으로 별도 계산.
  // (이 시트는 zeroRateEligible 필드를 product 에 두지 않을 수도 있으므로 안전 fallback)

  // 오프라인(기본) 정가·판매가 — VAT 포함 입력값
  // 정가는 listPrice > sellingPrice (실제 할인 있음) 일 때만 채움 — auto-fill 폐지
  const initialSellingVat = toVatPrice(product.sellingPrice, product.taxType);
  const initialListVat = product.listPrice
    ? toVatPrice(product.listPrice, product.taxType)
    : 0;
  const [offlineListVat, setOfflineListVat] = useState(() =>
    initialListVat > initialSellingVat ? String(initialListVat) : "",
  );
  const [offlineSellingVat, setOfflineSellingVat] = useState(() =>
    String(initialSellingVat),
  );

  const [listPriceDialogOpen, setListPriceDialogOpen] = useState(false);
  const [sellingPriceDialogOpen, setSellingPriceDialogOpen] = useState(false);
  // 할인% / 할인금액 입력 — 타이핑 중에는 raw, 블러 후 계산값 표시
  const [discountPctInput, setDiscountPctInput] = useState("");
  const [discountAmtInput, setDiscountAmtInput] = useState("");
  const [discountInputActive, setDiscountInputActive] = useState<"pct" | "amt" | null>(
    null,
  );

  // 파생값
  const lpVat = parseFloat(offlineListVat || "0");
  const spVat = parseFloat(offlineSellingVat || "0");
  const hasList = lpVat > 0;
  const discountAmt = hasList && lpVat > spVat ? lpVat - spVat : 0;
  const discountPct =
    hasList && discountAmt > 0 ? ((discountAmt / lpVat) * 100).toFixed(1) : null;
  const lpNet =
    isTaxable && taxRate > 0 && lpVat > 0 ? Math.round(lpVat / (1 + taxRate)) : lpVat;
  const spNet =
    isTaxable && taxRate > 0 && spVat > 0 ? Math.round(spVat / (1 + taxRate)) : spVat;
  // dialog onSubmit 가 NET 반환 → VAT 환산 후 state 저장 헬퍼
  const netToVatStored = (net: number): string => {
    if (net <= 0) return "";
    const vat = isTaxable && taxRate > 0 ? Math.round(net * (1 + taxRate)) : net;
    return String(vat);
  };

  // 오프라인 가격 저장 시 product PUT 에 넘길 필드 베이스 (가격 외 필드는 현재값 유지)
  const buildFieldsBase = (): ProductFieldsInput => ({
    name: product.name,
    sku: product.sku,
    brand: product.brandRef?.name ?? product.brand ?? null,
    brandId: product.brandId ?? null,
    modelName: product.modelName ?? null,
    spec: product.spec ?? null,
    description: product.description ?? null,
    unitOfMeasure: product.unitOfMeasure,
    productType: product.productType as ProductFieldsInput["productType"],
    taxType: product.taxType as ProductFieldsInput["taxType"],
    taxRate: product.taxRate ?? "0.1",
    listPrice: product.listPrice ?? product.sellingPrice,
    sellingPrice: product.sellingPrice,
    isSet: product.isSet,
    isBulk: product.isBulk,
    containerSize: product.containerSize ?? null,
    bulkProductId: product.bulkProductId ?? null,
    imageUrl: product.imageUrl ?? null,
    memo: product.memo ?? null,
    categoryId: product.categoryId ?? null,
    assemblyTemplateId: product.assemblyTemplateId ?? null,
    zeroRateEligible: product.zeroRateEligible,
  });

  const [rows, setRows] = useState<Map<string, RowState>>(() => {
    const map = new Map<string, RowState>();
    for (const cp of product.channelPricings ?? []) {
      map.set(cp.channelId, {
        channelId: cp.channelId,
        enabled: true,
        vatPrice: String(toVatPrice(cp.sellingPrice, product.taxType)),
      });
    }
    return map;
  });

  const setRow = (channelId: string, patch: Partial<RowState>) =>
    setRows((prev) => {
      const next = new Map(prev);
      const cur = next.get(channelId) ?? {
        channelId,
        enabled: false,
        vatPrice: "",
      };
      next.set(channelId, { ...cur, ...patch });
      return next;
    });

  const channels = channelsQuery.data ?? [];

  const costsByChannel = new Map<string, typeof product.sellingCosts>();
  for (const c of product.sellingCosts ?? []) {
    if (!c.channelId) continue;
    const list = costsByChannel.get(c.channelId) ?? [];
    list.push(c);
    costsByChannel.set(c.channelId, list);
  }

  const [costsEditChannelId, setCostsEditChannelId] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async () => {
      // 오프라인(기본) 가격 — 변경됐을 때만 product PUT
      const vatToNet = (vatStr: string) => {
        const vat = parseInt(vatStr.replace(/,/g, ""), 10) || 0;
        return isTaxable && taxRate > 0 ? Math.round(vat / (1 + taxRate)) : vat;
      };
      const newSellingNet = vatToNet(offlineSellingVat);
      // 정가는 빈 칸/0 이면 0 저장 (정가 미설정 = 할인 표시 없음). sellingPrice 폴백 없음.
      const newListNet = vatToNet(offlineListVat);
      const curSellingNet = parseInt(product.sellingPrice || "0", 10) || 0;
      const curListNet = parseInt(product.listPrice ?? "0", 10) || 0;
      if (newSellingNet !== curSellingNet || newListNet !== curListNet) {
        if (newSellingNet <= 0) {
          throw new Error("오프라인 판매가를 입력해주세요");
        }
        await updateProductFields(product.id, {
          ...buildFieldsBase(),
          listPrice: String(newListNet),
          sellingPrice: String(newSellingNet),
        });
      }

      const next: ChannelPriceState[] = [];
      for (const ch of channels) {
        const r = rows.get(ch.id);
        if (!r || !r.enabled || !r.vatPrice) {
          next.push({ channelId: ch.id, price: null });
          continue;
        }
        const vat = parseFloat(r.vatPrice);
        const net =
          isTaxable && taxRate > 0
            ? Math.round(vat / (1 + taxRate))
            : Math.round(vat);
        next.push({ channelId: ch.id, price: String(net) });
      }
      const prev = (product.channelPricings ?? []).map((cp) => ({
        pricingId: cp.id,
        channelId: cp.channelId,
      }));
      const result = await syncChannelPricings(product.id, prev, next);
      if (result.failed.length > 0) {
        throw new Error(`일부 항목 실패: ${result.failed.join(", ")}`);
      }
    },
    onSuccess: () => {
      toast.success("채널 가격이 저장되었습니다");
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : err.message || "저장에 실패했습니다",
      ),
  });

  return (
    <>
      <JmDrawerContent
        side="bottom"
        size="xl"
        className="flex flex-col p-0"
        dragHandle={false}
      >
        <JmDrawerHeader className="border-b border-[var(--jm-border)] px-5 py-4 flex-shrink-0">
          <JmDrawerTitle>채널별 가격 편집</JmDrawerTitle>
          <JmDrawerDescription className="text-jm-xs">
            오프라인(기본) 정가·판매가와 외부 채널 판매가를 VAT 포함 금액으로
            입력합니다. 저장 시 DB에는 세전(공급가액)으로 환산되어 저장됩니다. 채널
            전용 비용은 행의 &ldquo;채널 비용 편집&rdquo; 버튼.
          </JmDrawerDescription>
        </JmDrawerHeader>

        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {/* 오프라인 (베이스라인) — Product.listPrice/sellingPrice */}
            <div className="rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface-muted)]/40 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <span className="font-medium text-jm-sm text-[var(--jm-text)]">
                  오프라인
                </span>
                <JmBadge
                  variant="default"
                  size="sm"
                  shape="square"
                  className="text-jm-2xs"
                >
                  기본
                </JmBadge>
                <span className="text-jm-2xs text-[var(--jm-text-muted)]">
                  VAT 포함 금액
                </span>
              </div>

              {/* 정가 (선택) */}
              <div className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-jm-xs text-[var(--jm-text-muted)]">
                  정가
                </span>
                <button
                  type="button"
                  onClick={() => setListPriceDialogOpen(true)}
                  className="flex-1 rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 py-2 text-right text-jm-sm tabular-nums transition-colors hover:bg-[var(--jm-surface-muted)]"
                >
                  {hasList ? (
                    <span className="font-semibold text-[var(--jm-text)]">
                      ₩{formatComma(String(lpVat))}
                    </span>
                  ) : (
                    <span className="text-jm-xs text-[var(--jm-text-muted)]">
                      탭하여 입력 — 할인 노출용
                    </span>
                  )}
                </button>
                {hasList && (
                  <button
                    type="button"
                    onClick={() => setOfflineListVat("")}
                    className="text-jm-xs text-[var(--jm-text-muted)] hover:text-[var(--jm-text)]"
                  >
                    지우기
                  </button>
                )}
              </div>

              {/* 판매가 (필수) */}
              <div className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-jm-xs text-[var(--jm-text-muted)]">
                  판매가
                </span>
                <button
                  type="button"
                  onClick={() => setSellingPriceDialogOpen(true)}
                  className="flex-1 rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 py-2 text-right text-jm-sm tabular-nums transition-colors hover:bg-[var(--jm-surface-muted)]"
                >
                  {spVat > 0 ? (
                    <span className="font-semibold text-[var(--jm-text)]">
                      ₩{formatComma(String(spVat))}
                    </span>
                  ) : (
                    <span className="text-jm-xs text-[var(--jm-text-muted)]">
                      탭하여 입력
                    </span>
                  )}
                </button>
              </div>

              {/* 할인 표시 + 입력 — 정가 설정 시에만 노출 */}
              {hasList && (
                <>
                  {discountAmt === 0 ? (
                    <div className="rounded-md border border-[var(--jm-warning-fg)]/30 bg-[var(--jm-warning-bg)] px-3 py-2 text-jm-2xs text-[var(--jm-warning-fg)]">
                      정가가 판매가({formatComma(String(spVat))}원) 이하라 할인이
                      표시되지 않습니다. 정가를 판매가보다 높게 입력하세요.
                    </div>
                  ) : (
                    <div className="rounded-md bg-[var(--jm-success-bg)] px-3 py-2 text-jm-sm font-semibold tabular-nums text-[var(--jm-success-fg)]">
                      할인 ₩{formatComma(String(discountAmt))} ({discountPct}% off)
                    </div>
                  )}

                  {/* 할인% / 할인금액 양방향 입력 */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                      <JmInput
                        size="sm"
                        type="text"
                        inputMode="decimal"
                        placeholder="할인%"
                        value={
                          discountInputActive === "pct"
                            ? discountPctInput
                            : discountPct ?? ""
                        }
                        onFocus={(e) => {
                          setDiscountInputActive("pct");
                          setDiscountPctInput(discountPct ?? "");
                          focusCaretEnd(e);
                        }}
                        onBlur={() => setDiscountInputActive(null)}
                        onChange={(e) => {
                          const v = e.target.value;
                          setDiscountPctInput(v);
                          setDiscountInputActive("pct");
                          const pct = parseFloat(v);
                          if (!isNaN(pct) && pct >= 0 && pct <= 100) {
                            const newSpVat = Math.round(lpVat * (1 - pct / 100));
                            setOfflineSellingVat(String(newSpVat));
                          }
                        }}
                        className="h-9 pr-7 text-right"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-jm-xs text-[var(--jm-text-muted)]">
                        %
                      </span>
                    </div>
                    <div className="relative">
                      <JmInput
                        size="sm"
                        type="text"
                        inputMode="numeric"
                        placeholder="할인금액"
                        value={
                          discountInputActive === "amt"
                            ? formatComma(discountAmtInput)
                            : discountAmt > 0
                              ? formatComma(String(discountAmt))
                              : ""
                        }
                        onFocus={(e) => {
                          setDiscountInputActive("amt");
                          setDiscountAmtInput(
                            discountAmt > 0 ? String(discountAmt) : "",
                          );
                          focusCaretEnd(e);
                        }}
                        onBlur={() => setDiscountInputActive(null)}
                        onChange={(e) => {
                          const raw = parseComma(e.target.value);
                          setDiscountAmtInput(raw);
                          setDiscountInputActive("amt");
                          const amt = parseFloat(raw);
                          if (!isNaN(amt) && amt >= 0 && amt <= lpVat) {
                            const newSpVat = Math.max(0, lpVat - amt);
                            setOfflineSellingVat(String(newSpVat));
                          }
                        }}
                        className="h-9 pr-8 text-right"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-jm-xs text-[var(--jm-text-muted)]">
                        원
                      </span>
                    </div>
                  </div>

                  {/* 빠른 할인% 칩 */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-jm-2xs text-[var(--jm-text-muted)]">
                      빠른 할인%:
                    </span>
                    {[5, 10, 15, 20, 30].map((pct) => {
                      const newSpVat = Math.round(lpVat * (1 - pct / 100));
                      return (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setOfflineSellingVat(String(newSpVat))}
                          className="rounded-full border border-[var(--jm-border)] bg-[var(--jm-surface)] px-2 py-0.5 text-jm-2xs text-[var(--jm-text)] transition-colors hover:bg-[var(--jm-surface-muted)]"
                        >
                          {pct}%
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {!hasList && (
                <p className="text-jm-2xs text-[var(--jm-text-muted)] leading-relaxed">
                  정가를 입력하면 카탈로그에 strikethrough 로 할인 노출됩니다. 비워두면
                  할인 표시 없음.
                </p>
              )}
            </div>

            {channels.length === 0 ? (
              <p className="text-jm-sm text-[var(--jm-text-muted)] py-6 text-center">
                등록된 외부 판매채널이 없습니다
              </p>
            ) : (
              channels.map((ch) => {
                const row = rows.get(ch.id) ?? {
                  channelId: ch.id,
                  enabled: false,
                  vatPrice: "",
                };
                const chCosts = costsByChannel.get(ch.id) ?? [];
                return (
                  <div
                    key={ch.id}
                    className="rounded-md border border-[var(--jm-border)] p-3 space-y-2"
                  >
                    <div className="flex items-center gap-3">
                      <JmCheckbox
                        checked={row.enabled}
                        onCheckedChange={(v) => setRow(ch.id, { enabled: !!v })}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-jm-sm text-[var(--jm-text)]">
                            {ch.name}
                          </span>
                          <JmBadge
                            variant="outline"
                            size="sm"
                            shape="square"
                            className="text-jm-2xs"
                          >
                            {ch.code}
                          </JmBadge>
                        </div>
                      </div>
                      <JmButton
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setCostsEditChannelId(ch.id)}
                      >
                        <Pencil />
                        <span>채널 비용 편집</span>
                      </JmButton>
                    </div>
                    {row.enabled && (
                      <div className="pl-7 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-jm-2xs text-[var(--jm-text-muted)] w-28">
                            판매가 (VAT 포함)
                          </span>
                          <span className="text-jm-sm text-[var(--jm-text)]">₩</span>
                          <JmInput
                            size="sm"
                            type="text"
                            inputMode="numeric"
                            value={formatComma(row.vatPrice)}
                            onChange={(e) =>
                              setRow(ch.id, { vatPrice: parseComma(e.target.value) })
                            }
                            onFocus={focusCaretEnd}
                            className="w-40"
                          />
                        </div>
                        <div className="text-jm-2xs text-[var(--jm-text-muted)] pl-30">
                          채널 전용 비용 요약: {summarizeCosts(chCosts)}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t border-[var(--jm-border)] px-5 py-4 flex justify-end gap-2 bg-[var(--jm-bg)] flex-shrink-0">
            <JmButton
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saveMutation.isPending}
            >
              취소
            </JmButton>
            <JmButton
              type="button"
              variant="cta"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              <span>저장</span>
            </JmButton>
          </div>
        </div>
      </JmDrawerContent>

      <ProductCostsEditSheet
        open={costsEditChannelId !== null}
        onOpenChange={(o) => {
          if (!o) setCostsEditChannelId(null);
        }}
        product={product}
        channelId={costsEditChannelId}
        channelName={
          costsEditChannelId
            ? channels.find((c) => c.id === costsEditChannelId)?.name
            : undefined
        }
      />

      {/* 정가 입력 드로워 */}
      <PriceInputDialog
        open={listPriceDialogOpen}
        onOpenChange={setListPriceDialogOpen}
        title="정가 입력 (오프라인)"
        initialNet={lpNet}
        taxType={product.taxType as "TAXABLE" | "TAX_FREE"}
        originalPrice={spNet > 0 ? spNet : undefined}
        onSubmit={(net) => {
          if (net <= 0) {
            setOfflineListVat("");
            return;
          }
          setOfflineListVat(netToVatStored(net));
        }}
      />

      {/* 판매가 입력 드로워 */}
      <PriceInputDialog
        open={sellingPriceDialogOpen}
        onOpenChange={setSellingPriceDialogOpen}
        title="판매가 입력 (오프라인)"
        initialNet={spNet}
        taxType={product.taxType as "TAXABLE" | "TAX_FREE"}
        originalPrice={lpNet > 0 ? lpNet : undefined}
        onSubmit={(net) => {
          if (net <= 0) {
            setOfflineSellingVat("");
            return;
          }
          setOfflineSellingVat(netToVatStored(net));
        }}
      />
    </>
  );
}
