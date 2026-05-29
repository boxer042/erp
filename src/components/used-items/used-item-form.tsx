"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";

import { apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { formatComma, parseComma } from "@/lib/utils";
import {
  JmAlert,
  JmButton,
  JmCard,
  JmCardContent,
  JmCardHeader,
  JmCardTitle,
  JmCheckbox,
  JmFormField,
  JmInput,
  JmSelect,
  JmTextarea,
} from "@/jm";
import { ProductCombobox, type ProductOption } from "@/components/product-combobox";
import { CustomerCombobox } from "@/components/customer-combobox";

import {
  USED_ITEM_SOURCE_LABEL,
  type UsedItemSource,
} from "./_types";
import { UsedItemImageUpload } from "./used-item-image-upload";

interface Customer {
  id: string;
  name: string;
  phone?: string | null;
  businessNumber?: string | null;
  type?: "INDIVIDUAL" | "BUSINESS";
}

export interface UsedItemFormValue {
  displayName: string;
  productId: string | null;
  acquiredFrom: UsedItemSource;
  acquiredCost: string;
  isAcquiredTaxable: boolean;
  acquiredAt: string; // yyyy-MM-dd
  sourceCustomerId: string | null;
  sourceMemo: string;
  spec: string;
  imageUrls: string[];
  memo: string;
  issueSerial: boolean;
  warrantyMonths: number;
}

export const EMPTY_USED_ITEM_FORM: UsedItemFormValue = {
  displayName: "",
  productId: null,
  acquiredFrom: "PURCHASED",
  acquiredCost: "0",
  isAcquiredTaxable: false,
  acquiredAt: format(new Date(), "yyyy-MM-dd"),
  sourceCustomerId: null,
  sourceMemo: "",
  spec: "",
  imageUrls: [],
  memo: "",
  issueSerial: false,
  warrantyMonths: 0,
};

const SOURCE_OPTIONS = (
  Object.keys(USED_ITEM_SOURCE_LABEL) as UsedItemSource[]
).map((v) => ({ value: v, label: USED_ITEM_SOURCE_LABEL[v] }));

interface Props {
  value: UsedItemFormValue;
  onChange: (next: UsedItemFormValue) => void;
  /** 수정 모드 — productId 변경 비활성 등 정책 */
  editing?: boolean;
}

export function UsedItemForm({ value, onChange, editing }: Props) {
  const [showProductMatch, setShowProductMatch] = useState(!!value.productId);

  // 카탈로그 매칭용 — productType=PARTS 만 우선 (조립 부속 중심). 필요시 전체로 확장 가능.
  const productsQuery = useQuery<ProductOption[]>({
    queryKey: queryKeys.products.list({ for: "used-item-match" }),
    queryFn: () => apiGet<ProductOption[]>("/api/products?excludeVariants=true"),
    staleTime: 1000 * 60 * 5,
    enabled: showProductMatch,
  });

  const customersQuery = useQuery<Customer[]>({
    queryKey: queryKeys.customers.list(),
    queryFn: () => apiGet<Customer[]>("/api/customers"),
    staleTime: 1000 * 60,
  });

  const patch = (p: Partial<UsedItemFormValue>) => onChange({ ...value, ...p });

  return (
    <div className="space-y-4">
      {/* 기본 정보 */}
      <JmCard>
        <JmCardHeader>
          <JmCardTitle>기본 정보</JmCardTitle>
        </JmCardHeader>
        <JmCardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <JmFormField label="품명" required>
              <JmInput
                value={value.displayName}
                onChange={(e) => patch({ displayName: e.target.value })}
                placeholder="예: 센다이 엔진 SD225R"
              />
            </JmFormField>
            <JmFormField label="규격">
              <JmInput
                value={value.spec}
                onChange={(e) => patch({ spec: e.target.value })}
                placeholder="(선택)"
              />
            </JmFormField>
          </div>

          {/* 카탈로그 매칭 */}
          <div className="space-y-2">
            <label className="flex cursor-pointer items-center gap-2 text-jm-sm">
              <JmCheckbox
                checked={showProductMatch}
                onCheckedChange={(c) => {
                  setShowProductMatch(c === true);
                  if (c !== true) patch({ productId: null });
                }}
                disabled={editing}
              />
              <span>매장 카탈로그 상품과 매칭</span>
              <span className="text-jm-xs text-[var(--jm-text-muted)]">
                — 매칭하면 같은 모델 신품과 함께 검색됨
              </span>
            </label>
            {showProductMatch && (
              <ProductCombobox
                products={productsQuery.data ?? []}
                value={value.productId ?? ""}
                onChange={(p) => patch({ productId: p.id || null })}
                placeholder="카탈로그에서 상품 선택..."
              />
            )}
          </div>
        </JmCardContent>
      </JmCard>

      {/* 매입 정보 */}
      <JmCard>
        <JmCardHeader>
          <JmCardTitle>매입 정보</JmCardTitle>
        </JmCardHeader>
        <JmCardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <JmFormField label="매입 출처" required>
              <JmSelect
                value={value.acquiredFrom}
                onChange={(v) =>
                  patch({ acquiredFrom: v as UsedItemSource })
                }
                options={SOURCE_OPTIONS}
              />
            </JmFormField>
            <JmFormField label="매입일" required>
              <JmInput
                type="date"
                value={value.acquiredAt}
                onChange={(e) => patch({ acquiredAt: e.target.value })}
              />
            </JmFormField>
            <JmFormField label="매입가">
              <div className="flex items-center gap-2">
                <JmInput
                  type="text"
                  inputMode="numeric"
                  value={formatComma(value.acquiredCost)}
                  onChange={(e) =>
                    patch({ acquiredCost: parseComma(e.target.value) })
                  }
                  placeholder="0"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <span className="shrink-0 text-jm-sm text-[var(--jm-text-muted)]">
                  원
                </span>
              </div>
            </JmFormField>
            <JmFormField
              label="세금계산서"
              hint="사업자 매입으로 세금계산서 받은 경우만"
            >
              <label className="flex h-9 cursor-pointer items-center gap-2 text-jm-sm">
                <JmCheckbox
                  checked={value.isAcquiredTaxable}
                  onCheckedChange={(c) =>
                    patch({ isAcquiredTaxable: c === true })
                  }
                />
                <span>세금계산서 받음 (매입세액 공제)</span>
              </label>
            </JmFormField>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <JmFormField label="매입처 (등록 고객)">
              <CustomerCombobox
                customers={customersQuery.data ?? []}
                value={value.sourceCustomerId ?? ""}
                onChange={(id) => patch({ sourceCustomerId: id || null })}
                onCreateNew={() => {
                  // 매입처 자체 등록은 사용 빈도 낮음 — 자유 텍스트로 처리 유도
                }}
                placeholder="고객 검색 (선택)"
              />
            </JmFormField>
            <JmFormField label="매입처 메모" hint="비등록 매입처 자유 입력">
              <JmInput
                value={value.sourceMemo}
                onChange={(e) => patch({ sourceMemo: e.target.value })}
                placeholder="예: 박OO (개인)"
              />
            </JmFormField>
          </div>
        </JmCardContent>
      </JmCard>

      {/* 시리얼 라벨 */}
      <JmCard>
        <JmCardHeader>
          <JmCardTitle>시리얼 라벨</JmCardTitle>
        </JmCardHeader>
        <JmCardContent className="space-y-3">
          <label className="flex cursor-pointer items-center gap-2 text-jm-sm">
            <JmCheckbox
              checked={value.issueSerial}
              onCheckedChange={(c) => patch({ issueSerial: c === true })}
              disabled={editing}
            />
            <span>시리얼 라벨 발번</span>
            <span className="text-jm-xs text-[var(--jm-text-muted)]">
              — 단품 판매 가능한 상태라 추적용 라벨 출력
            </span>
          </label>

          {value.issueSerial && (
            <JmFormField
              label="보증 기간 (개월)"
              hint="0 입력 시 보증 없음"
            >
              <div className="flex items-center gap-2">
                <JmInput
                  type="number"
                  min={0}
                  max={120}
                  value={String(value.warrantyMonths)}
                  onChange={(e) =>
                    patch({
                      warrantyMonths: Math.max(
                        0,
                        Math.min(120, parseInt(e.target.value, 10) || 0),
                      ),
                    })
                  }
                  className="w-32"
                />
                <span className="shrink-0 text-jm-sm text-[var(--jm-text-muted)]">
                  개월
                </span>
              </div>
            </JmFormField>
          )}

          {editing && (
            <JmAlert variant="info">
              시리얼 발번 토글은 매입 등록 시점에만 결정 가능합니다. 사후 발번은
              상세 페이지의 [시리얼 발번] 액션 사용.
            </JmAlert>
          )}
        </JmCardContent>
      </JmCard>

      {/* 사진 */}
      <JmCard>
        <JmCardHeader>
          <JmCardTitle>사진</JmCardTitle>
        </JmCardHeader>
        <JmCardContent>
          <UsedItemImageUpload
            value={value.imageUrls}
            onChange={(urls) => patch({ imageUrls: urls })}
          />
        </JmCardContent>
      </JmCard>

      {/* 메모 */}
      <JmCard>
        <JmCardHeader>
          <JmCardTitle>메모</JmCardTitle>
        </JmCardHeader>
        <JmCardContent>
          <JmTextarea
            value={value.memo}
            onChange={(e) => patch({ memo: e.target.value })}
            placeholder="(선택) 상태·이력 등"
            rows={3}
          />
        </JmCardContent>
      </JmCard>

      {productsQuery.isFetching && (
        <p className="text-jm-xs text-[var(--jm-text-muted)]">
          <Loader2 className="inline size-3 animate-spin" /> 카탈로그 불러오는 중...
        </p>
      )}
    </div>
  );
}
