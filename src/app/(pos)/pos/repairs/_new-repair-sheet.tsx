"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, ScanLine, ShieldCheck, Wrench, X } from "lucide-react";
import { toast } from "sonner";
import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import {
  JmButton,
  JmDrawer,
  JmDrawerBody,
  JmDrawerContent,
  JmDrawerFooter,
  JmDrawerHeader,
  JmDrawerTitle,
  JmInput,
  JmSearchInput,
  JmSectionLabel,
  JmTextarea,
} from "@/jm";

interface Customer {
  id: string;
  name: string;
  phone: string;
}

// GET /api/serial-items/[code] 응답 중 수리 접수에 필요한 부분.
interface SerialLookup {
  id: string;
  code: string;
  status: string;
  device: { name: string } | null;
  customer: { id: string | null; name: string; phone: string } | null;
  warranty: { active: boolean; daysLeft: number | null };
  repairs: { id: string }[];
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (ticketId: string) => void;
  /** 미등록 고객일 때 ticket 의 카트 세션 매핑 — DB 에 영구 추적 (선택) */
  posSessionId?: string;
}

/**
 * 새 수리 시작 — JmDrawer 기반.
 * 단순화: 고객(검색·새 등록), 유형(즉시/맡김), 기기 정보(자유 입력), 증상.
 * 진단비/매핑 등 디테일은 상세 페이지에서.
 */
export function NewRepairSheet({ open, onOpenChange, onCreated, posSessionId }: Props) {
  // 즉시수리가 더 흔해서 디폴트
  const [type, setType] = useState<"ON_SITE" | "DROP_OFF">("ON_SITE");
  // 작업 성격 — 일반 수리(기본) / 리빌드. RepairType 과 직교
  const [workKind, setWorkKind] = useState<"REPAIR" | "CUSTOM_BUILD">("REPAIR");
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [device, setDevice] = useState("");
  const [symptom, setSymptom] = useState("");
  // 시리얼 조회 — 스캔/입력으로 기존 시리얼을 찾아 고객·기기 자동 채움
  const [serialCode, setSerialCode] = useState("");
  const [foundSerial, setFoundSerial] = useState<SerialLookup | null>(null);

  const serialLookup = useMutation({
    mutationFn: (code: string) =>
      apiGet<SerialLookup>(`/api/serial-items/${encodeURIComponent(code.trim())}`),
    onSuccess: (s) => {
      setFoundSerial(s);
      if (s.customer?.id) {
        setSelectedCustomer({
          id: s.customer.id,
          name: s.customer.name,
          phone: s.customer.phone,
        });
      }
      if (s.device?.name) setDevice(s.device.name);
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "시리얼을 찾을 수 없습니다",
      ),
  });

  // 고객 검색
  const customersQuery = useQuery<Customer[]>({
    queryKey: ["repairs", "customer-search", customerSearch],
    queryFn: () =>
      apiGet<Customer[]>(
        `/api/customers?search=${encodeURIComponent(customerSearch)}&limit=8`,
      ),
    enabled: customerSearch.length > 0 && !selectedCustomer,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const ticket = await apiMutate<{ id: string; ticketNo: string }>(
        "/api/repair-tickets",
        "POST",
        {
          type,
          workKind,
          customerId: selectedCustomer?.id ?? null,
          serialItemId: foundSerial?.id ?? null,
          repairProductText: device.trim() || null,
          symptom: symptom.trim() || null,
          // 미등록 고객이면 카트 세션 매핑 — 등록 고객은 customerId 가 매핑 역할
          posSessionId: selectedCustomer ? null : posSessionId ?? null,
        },
      );
      // ON_SITE 면 자동으로 REPAIRING 으로 (사용자 의도: 즉시는 그 자리에서 작업)
      if (type === "ON_SITE") {
        await apiMutate(
          `/api/repair-tickets/${ticket.id}/transition`,
          "POST",
          { action: "start" },
        );
      }
      return ticket;
    },
    onSuccess: (ticket) => {
      toast.success(`수리 접수 — ${ticket.ticketNo}`);
      onCreated(ticket.id);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "생성 실패"),
  });

  return (
    <JmDrawer open={open} onOpenChange={onOpenChange}>
      <JmDrawerContent side="bottom" size="lg" dragHandle>
        <JmDrawerHeader>
          <JmDrawerTitle>새 수리</JmDrawerTitle>
        </JmDrawerHeader>

        <JmDrawerBody>
          <div className="flex flex-col gap-5">
            {/* 시리얼 조회 — 스캔/입력으로 기존 기기·고객 자동 채움 */}
            <Section label="시리얼 조회" optional>
              {foundSerial ? (
                <div className="flex flex-col gap-2 rounded-xl bg-[var(--jm-surface-muted)] px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-jm-sm font-semibold text-[var(--jm-text)]">
                      #{foundSerial.code}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setFoundSerial(null);
                        setSerialCode("");
                      }}
                      aria-label="시리얼 해제"
                      className="text-[var(--jm-text-muted)]"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <span className="text-jm-sm text-[var(--jm-text)]">
                    {foundSerial.device?.name ?? "기기 미상"}
                  </span>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-jm-2xs text-[var(--jm-text-muted)]">
                    <span className="flex items-center gap-1">
                      <ShieldCheck className="size-3" />
                      {foundSerial.warranty.daysLeft == null
                        ? "보증 정보 없음"
                        : foundSerial.warranty.active
                          ? `보증 ${foundSerial.warranty.daysLeft}일 남음`
                          : "보증 만료"}
                    </span>
                    <span className="flex items-center gap-1">
                      <Wrench className="size-3" />
                      이전 수리 {foundSerial.repairs.length}건
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <JmInput
                    size="lg"
                    value={serialCode}
                    onChange={(e) => setSerialCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !e.nativeEvent.isComposing &&
                        serialCode.trim()
                      ) {
                        serialLookup.mutate(serialCode);
                      }
                    }}
                    placeholder="시리얼 코드 입력·스캔"
                    className="flex-1"
                  />
                  <JmButton
                    variant="outline"
                    size="lg"
                    disabled={!serialCode.trim() || serialLookup.isPending}
                    onClick={() => serialLookup.mutate(serialCode)}
                  >
                    {serialLookup.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <ScanLine className="size-4" />
                    )}
                    조회
                  </JmButton>
                </div>
              )}
            </Section>

            {/* 유형 — 큰 토글 */}
            <Section label="유형">
              <div className="grid grid-cols-2 gap-2">
                <TypeOption
                  active={type === "ON_SITE"}
                  onClick={() => setType("ON_SITE")}
                  title="즉시"
                  desc="현장에서 바로 수리"
                />
                <TypeOption
                  active={type === "DROP_OFF"}
                  onClick={() => setType("DROP_OFF")}
                  title="맡김"
                  desc="며칠 보관 후 픽업"
                />
              </div>
            </Section>

            {/* 작업 성격 — 일반 수리 / 리빌드 */}
            <Section label="작업 성격">
              <div className="grid grid-cols-2 gap-2">
                <TypeOption
                  active={workKind === "REPAIR"}
                  onClick={() => setWorkKind("REPAIR")}
                  title="일반 수리"
                  desc="고장 부품 교체·수리"
                />
                <TypeOption
                  active={workKind === "CUSTOM_BUILD"}
                  onClick={() => setWorkKind("CUSTOM_BUILD")}
                  title="리빌드"
                  desc="손님 부품 + 부속 조합"
                />
              </div>
            </Section>

            {/* 고객 */}
            <Section label="고객" optional>
              {selectedCustomer ? (
                <div className="flex items-center justify-between rounded-xl bg-[var(--jm-surface-muted)] px-4 py-3">
                  <div className="flex flex-col">
                    <span className="text-jm-base font-semibold text-[var(--jm-text)]">
                      {selectedCustomer.name}
                    </span>
                    <span className="font-mono text-jm-2xs text-[var(--jm-text-muted)]">
                      {selectedCustomer.phone}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCustomer(null);
                      setCustomerSearch("");
                    }}
                    className="text-jm-2xs font-medium text-[var(--jm-text-muted)] underline-offset-2 hover:underline"
                  >
                    변경
                  </button>
                </div>
              ) : (
                <>
                  <JmSearchInput
                    size="lg"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="이름 또는 전화 검색"
                  />
                  {customerSearch.length > 0 && (
                    <div className="mt-2 flex flex-col gap-1">
                      {customersQuery.isPending ? (
                        <div className="px-3 py-2 text-jm-sm text-[var(--jm-text-subtle)]">
                          검색 중…
                        </div>
                      ) : customersQuery.data?.length === 0 ? (
                        <div className="rounded-xl bg-[var(--jm-bg)] px-3 py-3 text-jm-sm text-[var(--jm-text-muted)]">
                          일치하는 고객 없음 — 미등록으로 진행하거나 고객 페이지에서 등록하세요
                        </div>
                      ) : (
                        customersQuery.data?.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setSelectedCustomer(c)}
                            className="flex items-center justify-between rounded-xl px-3 py-2.5 text-left hover:bg-[var(--jm-surface-muted)] active:bg-[var(--jm-border)]"
                          >
                            <span className="text-jm-sm font-medium text-[var(--jm-text)]">
                              {c.name}
                            </span>
                            <span className="font-mono text-jm-2xs text-[var(--jm-text-muted)]">
                              {c.phone}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
            </Section>

            {/* 기기 */}
            <Section label="기기" optional>
              <JmInput
                size="lg"
                value={device}
                onChange={(e) => setDevice(e.target.value)}
                placeholder="예: Sony A7M4 (Black)"
              />
              <p className="mt-1.5 text-jm-2xs text-[var(--jm-text-muted)]">
                상세 페이지에서 시리얼 코드/카탈로그 매핑으로 정밀화 가능
              </p>
            </Section>

            {/* 증상 */}
            <Section label="증상" optional>
              <JmTextarea
                value={symptom}
                onChange={(e) => setSymptom(e.target.value)}
                placeholder="고객이 호소하는 증상"
                rows={3}
              />
            </Section>
          </div>
        </JmDrawerBody>

        <JmDrawerFooter>
          <JmButton
            variant="cta"
            size="lg"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="w-full"
          >
            {createMutation.isPending && <Loader2 className="size-4 animate-spin" />}
            {workKind === "CUSTOM_BUILD"
              ? type === "ON_SITE"
                ? "즉시 리빌드 시작"
                : "리빌드 접수"
              : type === "ON_SITE"
                ? "즉시 수리 시작"
                : "맡김 접수"}
          </JmButton>
        </JmDrawerFooter>
      </JmDrawerContent>
    </JmDrawer>
  );
}

function Section({
  label,
  optional,
  children,
}: {
  label: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <JmSectionLabel>{label}</JmSectionLabel>
        {optional && (
          <span className="text-jm-3xs text-[var(--jm-text-subtle)]">선택</span>
        )}
      </div>
      {children}
    </div>
  );
}

function TypeOption({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col gap-1 rounded-2xl border-2 p-4 text-left transition-colors ${
        active
          ? "border-[var(--jm-action)] bg-[var(--jm-bg)]"
          : "border-[var(--jm-border)] bg-[var(--jm-surface)] text-[var(--jm-text-muted)] hover:border-[var(--jm-border-strong)]"
      }`}
    >
      <span
        className={`text-jm-base font-semibold ${active ? "text-[var(--jm-text)]" : ""}`}
      >
        {title}
      </span>
      <span className="text-jm-2xs text-[var(--jm-text-muted)]">{desc}</span>
    </button>
  );
}
