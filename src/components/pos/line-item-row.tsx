"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import {
  JmIconButton,
  JmQuantityStepper,
  type JmQuantityStepperProps,
} from "@/jm";
import { cn } from "@/jm/lib/cn";

export interface PosLineItemRowProps {
  /** 좌측 썸네일 슬롯 — 지정 시 이미지 영역 노출 (POS 카트). 생략 시 없음 */
  image?: React.ReactNode;
  /** 품목명 */
  name: string;
  /** 품목명 취소선 (수리 LOST 미청구 등) */
  nameStrikethrough?: boolean;
  /**
   * 품목명 영역 전체를 대체하는 슬롯 (예: 주문 등록의 서비스명 인라인 편집 입력).
   * 지정 시 name/nameStrikethrough 대신 이 노드를 렌더 — flex-1 요소를 넘길 것.
   */
  nameSlot?: React.ReactNode;
  /** SKU — 이름 아래 모노스페이스 */
  sku?: string | null;
  /** 이름 우측 영역 — 배지/토글 (수리 USED/LOST 등) */
  headerEnd?: React.ReactNode;
  /** 이름·SKU 아래 영역 — 옵션 요약·배지·트리거 (POS 카트). 래퍼 없이 그대로 렌더 */
  headerBelow?: React.ReactNode;
  /** 삭제 핸들러 — 미지정 시 삭제 버튼 숨김 */
  onDelete?: () => void;
  deleteDisabled?: boolean;

  /** 단가 라벨 — 기본 "단가" */
  unitPriceLabel?: string;
  /** 단가 표시 내용(값만 — 폰트는 행이 통일 적용). 카트는 정가 strike·할인율 등 부가 요소 포함 가능 */
  unitPrice: React.ReactNode;
  /** 단가 클릭 (가격 다이얼로그 오픈). 미지정 시 비클릭 */
  onUnitPriceClick?: () => void;

  /** 수량 스테퍼 설정 (value/onChange/min/max/step/decimal) — disabled 는 행 disabled 따름 */
  quantity: Omit<JmQuantityStepperProps, "disabled">;

  /** 합계 라벨 — 기본 "합계" */
  totalLabel?: string;
  /** 합계 표시 내용(값만 — 폰트는 행이 통일 적용) */
  total: React.ReactNode;
  /** 합계 클릭 (합계 다이얼로그 오픈). 미지정 시 비클릭 */
  onTotalClick?: () => void;

  /** 읽기 전용 — 단가/합계 클릭 + 수량 스테퍼 비활성 */
  disabled?: boolean;
  /** 컨테이너 추가 클래스 (들여쓰기·opacity 등 변형) */
  className?: string;
  /** 2행 아래 추가 콘텐츠 (옵션 ref 자식 행 등) */
  children?: React.ReactNode;
}

const priceBtn =
  "flex flex-col rounded-lg px-2 py-1 hover:bg-[var(--jm-bg)] active:bg-[var(--jm-surface-muted)] disabled:hover:bg-transparent";
const priceLabel =
  "text-jm-3xs uppercase tracking-wider text-[var(--jm-text-subtle)]";
// 단가·합계 값 폰트 — 행이 단일 소스로 통일 (weight 만 단가 semibold / 합계 bold 분기)
const priceValue = (weight: string) =>
  `text-jm-md tabular-nums text-[var(--jm-text)] ${weight}`;

/**
 * POS 라인 아이템 행 — 카트 라인·수리 부속 공용.
 *
 * 1행: (썸네일) 이름/SKU + 우측 배지(headerEnd) + 하단 영역(headerBelow) + 삭제
 * 2행: 단가(클릭→다이얼로그) · 수량 스테퍼 · 합계(클릭→다이얼로그)
 *
 * 순수 표시 컴포넌트 — 데이터/뮤테이션 로직 없음. 가격 편집 다이얼로그는
 * 컨텍스트별 설정이 달라(서비스 토글·영세율·정가 비교) 호출자가 자체 보유하고,
 * 행은 onUnitPriceClick/onTotalClick 으로 트리거만 노출한다.
 */
export function PosLineItemRow({
  image,
  name,
  nameStrikethrough,
  nameSlot,
  sku,
  headerEnd,
  headerBelow,
  onDelete,
  deleteDisabled,
  unitPriceLabel = "단가",
  unitPrice,
  onUnitPriceClick,
  quantity,
  totalLabel = "합계",
  total,
  onTotalClick,
  disabled = false,
  className,
  children,
}: PosLineItemRowProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-b border-[var(--jm-border)] px-4 py-3 last:border-b-0",
        className,
      )}
    >
      {/* 1행: (썸네일) 이름/SKU/배지 + 삭제 */}
      <div className="flex items-start gap-3">
        {image}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 items-center justify-between gap-2">
            {nameSlot ?? (
              <span
                className={cn(
                  "min-w-0 flex-1 line-clamp-1 text-jm-base font-semibold text-[var(--jm-text)]",
                  nameStrikethrough && "line-through",
                )}
              >
                {name}
              </span>
            )}
            {headerEnd && (
              <div className="flex shrink-0 items-center gap-1">{headerEnd}</div>
            )}
          </div>
          {sku && (
            <span className="font-mono text-jm-2xs text-[var(--jm-text-subtle)]">
              {sku}
            </span>
          )}
          {headerBelow}
        </div>
        {onDelete && (
          <JmIconButton
            size="sm"
            variant="ghost"
            onClick={onDelete}
            disabled={deleteDisabled}
            aria-label="삭제"
          >
            <Trash2 className="size-4" />
          </JmIconButton>
        )}
      </div>

      {/* 2행: 단가 · 수량 · 합계 */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onUnitPriceClick}
          disabled={disabled || !onUnitPriceClick}
          className={cn(priceBtn, "items-start text-left")}
        >
          <span className={priceLabel}>{unitPriceLabel}</span>
          {/* 값 폰트는 행이 통일 적용 — 카트/수리 재사용 시 동일 보장 (호출자는 내용만 전달) */}
          <div className={priceValue("font-semibold")}>{unitPrice}</div>
        </button>

        <JmQuantityStepper {...quantity} disabled={disabled} />

        <button
          type="button"
          onClick={onTotalClick}
          disabled={disabled || !onTotalClick}
          className={cn(priceBtn, "items-end text-right")}
        >
          <span className={priceLabel}>{totalLabel}</span>
          <div className={priceValue("font-bold")}>{total}</div>
        </button>
      </div>

      {children}
    </div>
  );
}
