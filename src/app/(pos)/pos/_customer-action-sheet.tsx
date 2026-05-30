"use client";

import { User, MessageCircle, RotateCcw, Search, Plus, ChevronRight } from "lucide-react";
import { BottomSheet } from "./_components/bottom-sheet";

/** POS·ERP 공용 데이터 — 등록 여부 + 이름만 필요 */
export interface CustomerActionData {
  customerId?: string | null;
  customerName?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  data: CustomerActionData;
  /** "기존 고객 연결" / "다른 고객으로 변경" — 검색 시트를 연다 */
  onLinkCustomer: () => void;
  /** "새 고객 등록" — 검색 건너뛰고 등록 시트 바로. 미지정 시 onLinkCustomer 폴백. */
  onCreateCustomer?: () => void;
  /** "고객 페이지" — 등록 고객 한정. POS 는 /pos/customer-profile/[id], ERP 는 /customers/[id]. 미지정 시 액션 비노출. */
  onViewProfile?: () => void;
  /** "반품·교환" — 등록 고객 한정. 미지정 시 액션 비노출 (POS 전용). */
  onReturnExchange?: () => void;
}

/**
 * 고객 썸네일 클릭 시 뜨는 액션 시트. POS·ERP 공용.
 * - 미등록: 기존 고객 연결 / 새 고객 등록
 * - 등록: 고객 페이지(옵션) / 다른 고객으로 변경 / 반품·교환(옵션)
 *
 * 고객 연결 해제는 의도적으로 제거 — ticket/order/rental 의 customerId 추적 끊김 사고 위험.
 * 잘못 연결한 경우는 "다른 고객으로 변경" 으로 충분.
 */
export function CustomerActionSheet({
  open,
  onOpenChange,
  data,
  onLinkCustomer,
  onCreateCustomer,
  onViewProfile,
  onReturnExchange,
}: Props) {
  if (!open) return null;
  return (
    <Body
      onOpenChange={onOpenChange}
      data={data}
      onLinkCustomer={onLinkCustomer}
      onCreateCustomer={onCreateCustomer}
      onViewProfile={onViewProfile}
      onReturnExchange={onReturnExchange}
    />
  );
}

function Body({
  onOpenChange,
  data,
  onLinkCustomer,
  onCreateCustomer,
  onViewProfile,
  onReturnExchange,
}: Omit<Props, "open">) {
  const isRegistered = !!data.customerId;

  const close = () => onOpenChange(false);

  return (
    <BottomSheet
      open
      onOpenChange={onOpenChange}
      title="고객"
      z="elevated"
    >
      <div className="flex flex-col gap-1 pb-2 pt-2">
        {isRegistered ? (
          <>
            {onViewProfile && (
              <Action
                icon={
                  <User className="size-[18px]" />
                }
                label="고객 페이지"
                desc={`${data.customerName ?? ""} — 구매·수리·임대 이력`}
                onClick={() => {
                  close();
                  onViewProfile();
                }}
              />
            )}
            <Action
              icon={
                <MessageCircle className="size-[18px]" />
              }
              label="다른 고객으로 변경"
              desc="현재 카트 그대로, 고객만 다시 선택"
              onClick={() => {
                close();
                onLinkCustomer();
              }}
            />
            {onReturnExchange && (
              <Action
                icon={
                  <RotateCcw className="size-[18px]" />
                }
                label="반품·교환"
                desc="이전 주문 선택 후 즉석 환불 또는 교환 시작"
                onClick={() => {
                  close();
                  onReturnExchange();
                }}
              />
            )}
          </>
        ) : (
          <>
            <Action
              icon={
                <Search className="size-[18px]" />
              }
              label="기존 고객 연결"
              desc="이름·전화로 검색해 매핑"
              onClick={() => {
                close();
                onLinkCustomer();
              }}
            />
            <Action
              icon={
                <Plus className="size-[18px]" />
              }
              label="새 고객 등록"
              desc="이름·전화 입력 후 즉시 매핑"
              onClick={() => {
                close();
                (onCreateCustomer ?? onLinkCustomer)();
              }}
            />
          </>
        )}
      </div>
    </BottomSheet>
  );
}

function Action({
  icon,
  label,
  desc,
  danger,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  desc?: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors active:bg-[var(--jm-surface-muted)] sm:hover:bg-[var(--jm-bg)]"
    >
      <div
        className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
          danger ? "bg-[var(--jm-danger-bg)] text-[var(--jm-danger-fg)]" : "bg-[var(--jm-surface-muted)] text-[var(--jm-text)]"
        }`}
      >
        {icon}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span
          className={`text-jm-base font-semibold ${
            danger ? "text-[var(--jm-danger-fg)]" : "text-[var(--jm-text)]"
          }`}
        >
          {label}
        </span>
        {desc && (
          <span className="line-clamp-1 text-jm-xs text-[var(--jm-text-muted)]">{desc}</span>
        )}
      </div>
      <ChevronRight className="size-3.5 shrink-0 text-[var(--jm-text-disabled)]" />
    </button>
  );
}
