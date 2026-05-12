"use client";

import { useRouter } from "next/navigation";
import type { CartSession } from "@/components/pos/sessions-context";
import { BottomSheet } from "./_components/bottom-sheet";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  session: CartSession;
  /** "기존 고객 연결" / "다른 고객으로 변경" — 검색 시트를 연다 */
  onLinkCustomer: () => void;
  /** "새 고객 등록" — 검색 건너뛰고 등록 시트 바로. 미지정 시 onLinkCustomer 폴백. */
  onCreateCustomer?: () => void;
  /** "반품·교환" — 등록 고객의 환불 가능 주문 시트 진입. 미지정 시 액션 비노출. */
  onReturnExchange?: () => void;
}

/**
 * 손님 작업 페이지 헤더 썸네일 클릭 시 뜨는 액션 시트.
 * - 미등록: 기존 고객 연결 / 새 고객 등록
 * - 등록: 고객 페이지 / 다른 고객으로 변경
 *
 * 고객 연결 해제는 의도적으로 제거 — ticket/order/rental 의 customerId 추적 끊김 사고 위험.
 * 잘못 연결한 경우는 "다른 고객으로 변경" 으로 충분.
 */
export function CustomerActionSheet({
  open,
  onOpenChange,
  session,
  onLinkCustomer,
  onCreateCustomer,
  onReturnExchange,
}: Props) {
  if (!open) return null;
  return (
    <Body
      onOpenChange={onOpenChange}
      session={session}
      onLinkCustomer={onLinkCustomer}
      onCreateCustomer={onCreateCustomer}
      onReturnExchange={onReturnExchange}
    />
  );
}

function Body({
  onOpenChange,
  session,
  onLinkCustomer,
  onCreateCustomer,
  onReturnExchange,
}: Omit<Props, "open">) {
  const router = useRouter();
  const isRegistered = !!session.customerId;

  const close = () => onOpenChange(false);

  return (
    <BottomSheet
      open
      onOpenChange={onOpenChange}
      title={isRegistered ? "고객" : "손님"}
    >
      <div className="flex flex-col gap-1 pb-2 pt-2">
        {isRegistered ? (
          <>
            <Action
              icon={
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M4 17c1.5-3 3.5-4.5 6-4.5s4.5 1.5 6 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              }
              label="고객 페이지"
              desc={`${session.customerName} — 구매·수리·임대 이력`}
              onClick={() => {
                close();
                if (session.customerId) {
                  router.push(`/pos/customer-profile/${session.customerId}`);
                }
              }}
            />
            <Action
              icon={
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                  <path d="M3 10c0-3.5 3-6 7-6s7 2.5 7 6-3 6-7 6c-1 0-2-.2-2.8-.5L4 17l1-3.2C3.7 12.7 3 11.4 3 10z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                </svg>
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
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                    <path
                      d="M4 10a6 6 0 1 1 1.76 4.24M4 14v-4h4"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
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
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                  <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M14 14l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
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
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                  <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
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
          className={`text-[14px] font-semibold ${
            danger ? "text-[var(--jm-danger-fg)]" : "text-[var(--jm-text)]"
          }`}
        >
          {label}
        </span>
        {desc && (
          <span className="line-clamp-1 text-[12px] text-[var(--jm-text-muted)]">{desc}</span>
        )}
      </div>
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        className="shrink-0 text-[var(--jm-text-disabled)]"
      >
        <path
          d="M5 3l4 4-4 4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
