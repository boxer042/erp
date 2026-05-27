"use client";

import { X } from "lucide-react";
import { JmBadge, JmIconButton, JmInput } from "@/jm";
import { focusCaretEnd } from "@/jm/lib/focus";
import { AssemblySlotLabelCombobox } from "@/components/assembly-slot-label-combobox";
import { ProductCombobox, type ProductOption } from "@/components/product-combobox";

/**
 * BOM 한 행이 보유한 식별 정보. 외부에서 다른 키(id)로 관리해도 onChange 로 patch 만 받음.
 * 슬롯 메타: slotLabelId(라벨 마스터 PK) / slotId(템플릿의 슬롯 instance PK).
 */
export interface BomComponentRowState {
  product: ProductOption | null;
  quantity: string;
  label: string;
  slotLabelId: string | null;
  slotId: string | null;
}

interface BomComponentRowProps {
  row: BomComponentRowState;
  onChange: (patch: Partial<BomComponentRowState>) => void;
  onRemove?: () => void;
  removeDisabled?: boolean;

  /** 콤보박스 후보 — 부모가 카테고리 등 필터 적용해 전달 */
  products: ProductOption[];
  /** 카테고리 필터 hint — placeholder 문구 변경용 */
  slotCategoryId?: string | null;

  /** 슬롯 라벨 마스터 + 인라인 신규 등록 핸들러 (ASSEMBLED 만) */
  slotLabels: { id: string; name: string }[];
  onCreateSlotLabel?: (name: string) => void;

  /**
   * 라벨 → 템플릿 슬롯(instance) 매핑.
   * 사용자가 라벨 고르면 매칭되는 slotId 도 자동 채워서 "슬롯 미연결" 방지.
   * 비어있거나 매칭 없으면 slotId 는 null 유지.
   */
  templateSlotIdByLabelId?: Map<string, string>;

  /** ASSEMBLED 면 슬롯 라벨 콤보박스 노출 + 라벨 자유입력 숨김 */
  isAssembled: boolean;

  /** products / slotLabels 로딩 중 — 콤보박스 disable + 안내 placeholder */
  isLoading?: boolean;

  /** 음수 quantity 허용 (예: 회수 부속 -1) */
  allowNegativeQty?: boolean;

  /** 슬롯 연결됨/미연결 배지 노출 (BOM 편집 화면 한정) */
  showSlotBadge?: boolean;

  /** 수량 입력 오른쪽 추가 콘텐츠 (예: 소계 ₩XXX) */
  rightContent?: React.ReactNode;
}

/**
 * 조립/세트 상품의 BOM 한 행 — slot label + product picker + quantity + 배지 + 삭제.
 *
 * 상품등록 페이지(NewProductForm) 와 상품 상세의 구성품 편집 시트가 공유.
 * 한쪽에서 row UI 정책 변경하면 둘 다 적용 — slotId 자동 매칭, 회수 배지 등.
 */
export function BomComponentRow({
  row,
  onChange,
  onRemove,
  removeDisabled = false,
  products,
  slotCategoryId,
  slotLabels,
  onCreateSlotLabel,
  templateSlotIdByLabelId,
  isAssembled,
  isLoading = false,
  allowNegativeQty = false,
  showSlotBadge = false,
  rightContent,
}: BomComponentRowProps) {
  const qtyNum = parseFloat(row.quantity);
  const isRecovery = allowNegativeQty && !Number.isNaN(qtyNum) && qtyNum < 0;
  const showSlotWarning = showSlotBadge && !!row.slotLabelId && !row.slotId;
  const showSlotConnected = showSlotBadge && !!row.slotId;

  const handleSlotLabelChange = (id: string, name: string) => {
    // 라벨 변경 시 템플릿의 동일 라벨 슬롯이 있으면 slotId 도 자동 매칭.
    // 매칭 없으면 slotId = null 로 리셋 (라벨이 바뀌었으므로 기존 slotId 도 유효성 잃음).
    const matchedSlotId = id ? templateSlotIdByLabelId?.get(id) ?? null : null;
    onChange({
      slotLabelId: id || null,
      label: name,
      slotId: matchedSlotId,
    });
  };

  const handleQtyChange = (v: string) => {
    const pattern = allowNegativeQty
      ? /^-?[0-9]*\.?[0-9]*$/
      : /^[0-9]*\.?[0-9]*$/;
    if (v === "" || (allowNegativeQty && v === "-") || pattern.test(v)) {
      onChange({ quantity: v });
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-[var(--jm-border)] bg-[var(--jm-bg)] p-2.5">
      {isAssembled && (
        <AssemblySlotLabelCombobox
          labels={slotLabels}
          value={row.slotLabelId ?? ""}
          onChange={handleSlotLabelChange}
          onCreateNew={onCreateSlotLabel ?? (() => {})}
          placeholder={
            row.label && !row.slotLabelId
              ? `${row.label} (재선택 필요)`
              : "라벨 선택..."
          }
          disabled={isLoading}
        />
      )}

      <ProductCombobox
        products={products}
        value={row.product?.id ?? ""}
        onChange={(p) => onChange({ product: p })}
        filterType="component"
        placeholder={
          isLoading
            ? "데이터 불러오는 중..."
            : slotCategoryId
              ? "카테고리 내 구성 상품 선택..."
              : "구성 상품 선택..."
        }
        disabled={isLoading}
      />

      {!isAssembled && (
        <JmInput
          size="sm"
          value={row.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="라벨 (선택) — 메인, 보너스 등"
        />
      )}

      <div className="flex items-center gap-2">
        <span className="text-jm-2xs text-[var(--jm-text-muted)]">수량</span>
        <JmInput
          size="sm"
          type="text"
          inputMode="decimal"
          value={row.quantity}
          onChange={(e) => handleQtyChange(e.target.value)}
          onFocus={focusCaretEnd}
          className="h-9 w-20 text-right"
        />
        {isRecovery && (
          <JmBadge variant="warning" size="sm" shape="square">
            회수
          </JmBadge>
        )}
        {showSlotWarning && (
          <JmBadge variant="default" size="sm" shape="square" className="ml-auto">
            슬롯 미연결
          </JmBadge>
        )}
        {showSlotConnected && (
          <JmBadge variant="info" size="sm" shape="square" className="ml-auto">
            슬롯 연결됨
          </JmBadge>
        )}
        {rightContent && (
          <div className={showSlotBadge ? "" : "ml-auto"}>{rightContent}</div>
        )}
        {onRemove && (
          <JmIconButton
            type="button"
            size="sm"
            variant="ghost"
            aria-label="구성 상품 삭제"
            className="text-[var(--jm-danger-fg)]"
            onClick={onRemove}
            disabled={removeDisabled}
          >
            <X />
          </JmIconButton>
        )}
      </div>
    </div>
  );
}
