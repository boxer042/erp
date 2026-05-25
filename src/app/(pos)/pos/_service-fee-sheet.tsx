"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { BottomSheet } from "./_components/bottom-sheet";
import { PriceInputDialog } from "./_components/price-input-dialog";

interface ServiceFeePreset {
  id: string;
  name: string;
  unitPrice: string | number;
  memo: string | null;
}

/** 기술료 라인 페이로드 — POS·ERP 양쪽이 각자 카트 모델로 변환 */
export interface ServiceFeeLine {
  name: string;
  /** 공급가액 (세전, 정수). 항상 과세 (TAXABLE) */
  unitPrice: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /**
   * 라인 추가 콜백 — POS 는 `useSessions().add` 호출, ERP /orders/new 는 로컬 setItems 호출.
   * 호출자에게 카트 모델 변환을 위임해 컴포넌트 자체는 context-free.
   */
  onAdd: (line: ServiceFeeLine) => void;
}

/**
 * 기술료/공임 추가 시트 — 상품 판매에 장착·설치 기술료를 라인으로 추가.
 * 프리셋 탭 → 즉시 추가 / 직접 입력 → 가격 입력 드로워로 공급가액 입력.
 * 기술료는 항상 과세 — itemType="service" 라인으로 카트에 들어가 결제 시 OrderItem.serviceName 으로 저장.
 *
 * 공용 (POS 카트 시트 + ERP 신규 주문) — onAdd 콜백으로 카트 추가 위임.
 */
export function ServiceFeeSheet(props: Props) {
  if (!props.open) return null;
  return <Body {...props} />;
}

function Body({ onOpenChange, onAdd }: Props) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState(0);
  const [priceOpen, setPriceOpen] = useState(false);

  const presetsQuery = useQuery({
    queryKey: queryKeys.serviceFeePresets.all,
    queryFn: () => apiGet<ServiceFeePreset[]>("/api/service-fee-presets"),
  });
  const presets = presetsQuery.data ?? [];

  const addLine = (lineName: string, net: number) => {
    onAdd({ name: lineName, unitPrice: Math.max(0, Math.round(net)) });
    toast.success(`${lineName} 추가`, { duration: 1500 });
    onOpenChange(false);
  };

  const canAddCustom = name.trim().length > 0 && amount > 0;

  return (
    <BottomSheet
      open
      onOpenChange={onOpenChange}
      title="기술료 / 공임 추가"
      footer={
        <button
          type="button"
          disabled={!canAddCustom}
          onClick={() => addLine(name.trim(), amount)}
          className="h-14 w-full rounded-2xl bg-[var(--jm-action)] text-[16px] font-semibold text-white transition-transform active:scale-[0.99] disabled:opacity-50"
        >
          기술료 추가
        </button>
      }
    >
      <div className="flex flex-col gap-5 pt-2">
        {/* 프리셋 — 탭하면 즉시 카트에 추가 */}
        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
            자주 쓰는 기술료
          </span>
          {presetsQuery.isPending ? (
            <p className="py-2 text-[13px] text-[var(--jm-text-subtle)]">불러오는 중…</p>
          ) : presets.length === 0 ? (
            <p className="py-2 text-[13px] text-[var(--jm-text-subtle)]">
              등록된 프리셋이 없습니다. 설정 → 기술료 프리셋에서 추가할 수 있습니다.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addLine(p.name, Number(p.unitPrice))}
                  className="flex items-center justify-between rounded-xl border border-[var(--jm-border)] bg-[var(--jm-bg)] px-4 py-3 text-left active:bg-[var(--jm-surface-muted)]"
                >
                  <span className="text-[14px] font-semibold text-[var(--jm-text)]">
                    {p.name}
                  </span>
                  <span className="text-[14px] font-semibold tabular-nums text-[var(--jm-text)]">
                    ₩{Number(p.unitPrice).toLocaleString("ko-KR")}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 직접 입력 — 항목명 + 가격 입력 드로워 */}
        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
            직접 입력
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="기술료 항목명 (예: 노트북 장착)"
            className="h-12 w-full rounded-xl border border-[var(--jm-border)] bg-[var(--jm-bg)] px-4 text-[15px] outline-none focus:border-[var(--jm-border-strong)] focus:bg-[var(--jm-surface)]"
          />
          <button
            type="button"
            onClick={() => setPriceOpen(true)}
            className="flex h-12 items-center justify-between rounded-xl border border-[var(--jm-border)] bg-[var(--jm-bg)] px-4 active:bg-[var(--jm-surface-muted)]"
          >
            <span className="text-[13px] text-[var(--jm-text-muted)]">금액 (공급가액)</span>
            <span className="text-[15px] font-semibold tabular-nums text-[var(--jm-text)]">
              ₩{amount.toLocaleString("ko-KR")}
            </span>
          </button>
          <p className="text-[11px] text-[var(--jm-text-muted)]">
            기술료는 항상 과세(VAT 10%) — 입력은 공급가액(세전) 기준입니다.
          </p>
        </div>
      </div>

      <PriceInputDialog
        open={priceOpen}
        onOpenChange={setPriceOpen}
        title="기술료 금액"
        initialNet={amount}
        taxType="TAXABLE"
        onSubmit={(net) => setAmount(net)}
      />
    </BottomSheet>
  );
}
