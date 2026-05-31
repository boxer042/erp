"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NoteTimeline } from "@/components/note-timeline";
import { toast } from "sonner";
import {
  ArrowLeft,
  Building2,
  ChevronRight,
  FileText,
  Mail,
  Pencil,
  Phone,
  Receipt,
  Tag,
  Trash2,
  TrendingDown,
  User,
  Wrench,
} from "lucide-react";

import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { formatBusinessNumber, formatPhone } from "@/lib/utils";
import {
  JmBadge,
  JmButton,
  JmCard,
  JmCardContent,
  JmContainer,
  JmDialog,
  JmDialogBody,
  JmDialogContent,
  JmDialogFooter,
  JmDialogHeader,
  JmDialogTitle,
  JmEmpty,
  JmIconButton,
  JmSpinner,
  JmStat,
  JmTabs,
  JmTabsIndicator,
  JmTabsList,
  JmTabsPanel,
  JmTabsTrigger,
} from "@/jm";

import { CustomerSheet } from "../_customer-sheet";
import { CustomersThemeScope } from "../_theme-scope";
import { CustomerStatusBadge, CustomerTypeBadge } from "../_parts";
import {
  formatDateShort,
  formatKRW,
  type CustomerDetail,
} from "./_detail-types";
import {
  InfoRow,
  OrderStatusBadge,
  RentalStatusBadge,
  RepairStatusBadge,
  RepairTypeBadge,
  SerialSourceBadge,
} from "./_detail-parts";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function CustomerDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const detailQuery = useQuery({
    queryKey: queryKeys.customers.detail(id),
    queryFn: () => apiGet<CustomerDetail>(`/api/customers/${id}/detail`),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
    queryClient.invalidateQueries({
      queryKey: queryKeys.customers.detail(id),
    });
  };

  const deleteMutation = useMutation({
    mutationFn: () => apiMutate(`/api/customers/${id}`, "DELETE"),
    onSuccess: () => {
      toast.success("고객이 비활성화되었습니다");
      invalidate();
      router.push("/customers");
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "비활성화에 실패했습니다",
      ),
  });

  const data = detailQuery.data;

  if (detailQuery.isError) {
    return (
      <CustomersThemeScope>
        <div className="flex h-full items-center justify-center bg-[var(--jm-bg)] p-8">
          <JmEmpty
            icon={<User className="size-8" />}
            title="고객을 불러오지 못했습니다"
            description="존재하지 않거나 권한이 없는 고객입니다"
            action={
              <JmButton onClick={() => router.push("/customers")}>
                목록으로 돌아가기
              </JmButton>
            }
          />
        </div>
      </CustomersThemeScope>
    );
  }

  if (!data) {
    return null; // loading.tsx 가 노출됨
  }

  const { customer, stats, recentOrders, recentRepairs, recentRentals, recentSerials, machines, notes } = data;
  const outstanding = parseFloat(stats.outstandingAmount || "0");
  const isBusiness = customer.type === "BUSINESS";

  return (
    <CustomersThemeScope>
      <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
        {/* 스티키 헤더 — 페이지 폭 제한 없음 (액션 버튼 다 보이도록) */}
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--jm-border)] bg-[var(--jm-bg)] px-6 py-3">
          <JmIconButton
            variant="ghost"
            size="sm"
            aria-label="목록으로"
            onClick={() => router.push("/customers")}
          >
            <ArrowLeft className="size-4" />
          </JmIconButton>
          <div className="flex items-center gap-2">
            <span className="text-jm-base font-semibold text-[var(--jm-text)]">
              {customer.name}
            </span>
            <CustomerTypeBadge type={customer.type} />
            <CustomerStatusBadge active={customer.isActive} />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <JmButton
              variant="outline"
              size="sm"
              onClick={() =>
                router.push(`/customers/ledger?customerId=${customer.id}`)
              }
            >
              <FileText className="size-4" />
              원장 보기
            </JmButton>
            <JmButton size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="size-4" />
              수정
            </JmButton>
            {customer.isActive && (
              <JmIconButton
                variant="ghost"
                size="sm"
                aria-label="비활성화"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="size-4" />
              </JmIconButton>
            )}
          </div>
        </div>

        <JmContainer
          width="default"
          padded={false}
          className="space-y-6 p-6"
        >
          {/* 인적사항 메타 — 헤더 아래 큰 본문 진입부 */}
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-jm-sm text-[var(--jm-text-muted)]">
              <span className="inline-flex items-center gap-1.5">
                <Phone className="size-3.5" />
                <span className="tabular-nums">
                  {formatPhone(customer.phone)}
                </span>
              </span>
              {customer.email && (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="size-3.5" />
                  {customer.email}
                </span>
              )}
              {customer.businessNumber && (
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="size-3.5" />
                  <span className="tabular-nums">
                    {formatBusinessNumber(customer.businessNumber)}
                  </span>
                </span>
              )}
            </div>
          </div>

          {/* KPI */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <JmStat
              label="미수금"
              value={formatKRW(stats.outstandingAmount)}
              icon={<TrendingDown className="size-4" />}
              hint={
                outstanding > 0
                  ? "회수 필요"
                  : outstanding < 0
                    ? "선수금"
                    : "잔액 없음"
              }
              size="sm"
              positiveIsGood={false}
              className={
                outstanding > 0
                  ? "ring-2 ring-[var(--jm-warning-fg)]/30"
                  : undefined
              }
            />
            <JmStat
              label="주문"
              value={stats.orderCount.toLocaleString("ko-KR")}
              icon={<Receipt className="size-4" />}
              hint={formatKRW(stats.orderTotal)}
              size="sm"
            />
            <JmStat
              label="수리"
              value={stats.repairCount.toLocaleString("ko-KR")}
              icon={<Wrench className="size-4" />}
              hint={formatKRW(stats.repairTotal)}
              size="sm"
            />
            <JmStat
              label="임대"
              value={stats.rentalCount.toLocaleString("ko-KR")}
              icon={<Tag className="size-4" />}
              hint={formatKRW(stats.rentalTotal)}
              size="sm"
            />
            <JmStat
              label="시리얼 라벨"
              value={stats.serialCount.toLocaleString("ko-KR")}
              icon={<Tag className="size-4" />}
              hint="발급 누적"
              size="sm"
            />
          </div>

          {/* 탭 */}
          <JmTabs defaultValue="overview">
            <div className="relative">
              <JmTabsList variant="line" className="overflow-x-auto">
                <JmTabsTrigger value="overview">개요</JmTabsTrigger>
                <JmTabsTrigger value="orders">
                  주문
                  <span className="ml-1 tabular-nums text-[var(--jm-text-subtle)]">
                    {stats.orderCount}
                  </span>
                </JmTabsTrigger>
                <JmTabsTrigger value="repairs">
                  수리
                  <span className="ml-1 tabular-nums text-[var(--jm-text-subtle)]">
                    {stats.repairCount}
                  </span>
                </JmTabsTrigger>
                <JmTabsTrigger value="rentals">
                  임대
                  <span className="ml-1 tabular-nums text-[var(--jm-text-subtle)]">
                    {stats.rentalCount}
                  </span>
                </JmTabsTrigger>
                <JmTabsTrigger value="serials">
                  시리얼
                  <span className="ml-1 tabular-nums text-[var(--jm-text-subtle)]">
                    {stats.serialCount}
                  </span>
                </JmTabsTrigger>
                <JmTabsTrigger value="machines">
                  기기
                  <span className="ml-1 tabular-nums text-[var(--jm-text-subtle)]">
                    {machines.length}
                  </span>
                </JmTabsTrigger>
                <JmTabsTrigger value="notes">
                  노트
                  <span className="ml-1 tabular-nums text-[var(--jm-text-subtle)]">
                    {notes.length}
                  </span>
                </JmTabsTrigger>
                <JmTabsIndicator />
              </JmTabsList>
            </div>

            {/* 개요 */}
            <JmTabsPanel value="overview" className="pt-2">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <JmCard>
                  <JmCardContent className="space-y-3 p-5">
                    <h3 className="text-jm-sm font-semibold text-[var(--jm-text)]">
                      기본 정보
                    </h3>
                    <dl className="space-y-2.5">
                      <InfoRow
                        label={isBusiness ? "상호" : "이름"}
                        value={customer.name}
                      />
                      <InfoRow
                        label="연락처"
                        value={formatPhone(customer.phone)}
                      />
                      <InfoRow label="이메일" value={customer.email} />
                      {isBusiness && (
                        <>
                          <InfoRow
                            label="사업자번호"
                            value={
                              customer.businessNumber
                                ? formatBusinessNumber(customer.businessNumber)
                                : ""
                            }
                          />
                          <InfoRow label="대표자" value={customer.ceo} />
                          <InfoRow label="업태" value={customer.businessType} />
                          <InfoRow label="종목" value={customer.businessItem} />
                          <InfoRow
                            label="FAX"
                            value={customer.fax ? formatPhone(customer.fax) : ""}
                          />
                        </>
                      )}
                    </dl>
                  </JmCardContent>
                </JmCard>

                <JmCard>
                  <JmCardContent className="space-y-3 p-5">
                    <h3 className="text-jm-sm font-semibold text-[var(--jm-text)]">
                      주소 / 담당자
                    </h3>
                    <dl className="space-y-2.5">
                      <InfoRow
                        label={isBusiness ? "사업장 주소" : "주소"}
                        value={customer.address}
                      />
                      <InfoRow
                        label="배송지"
                        value={customer.shippingAddress}
                      />
                      {isBusiness && (
                        <>
                          <InfoRow label="담당자" value={customer.contactName} />
                          <InfoRow
                            label="직책"
                            value={customer.contactPosition}
                          />
                          <InfoRow
                            label="담당자 연락처"
                            value={
                              customer.contactPhone
                                ? formatPhone(customer.contactPhone)
                                : ""
                            }
                          />
                        </>
                      )}
                    </dl>
                  </JmCardContent>
                </JmCard>

                {customer.memo && (
                  <JmCard className="lg:col-span-2">
                    <JmCardContent className="space-y-2 p-5">
                      <h3 className="text-jm-sm font-semibold text-[var(--jm-text)]">
                        메모
                      </h3>
                      <p className="whitespace-pre-wrap text-jm-sm leading-relaxed text-[var(--jm-text)]">
                        {customer.memo}
                      </p>
                    </JmCardContent>
                  </JmCard>
                )}
              </div>
            </JmTabsPanel>

            {/* 주문 */}
            <JmTabsPanel value="orders" className="pt-2">
              <JmCard>
                <JmCardContent className="p-0">
                  {recentOrders.length === 0 ? (
                    <JmEmpty
                      icon={<Receipt className="size-8" />}
                      title="주문 이력 없음"
                      description="이 고객으로 등록된 주문이 아직 없습니다"
                    />
                  ) : (
                    <ul className="divide-y divide-[var(--jm-border)]">
                      {recentOrders.map((o) => (
                        <li key={o.id}>
                          <Link
                            href={`/orders?id=${o.id}`}
                            className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-[var(--jm-surface-muted)]"
                          >
                            <span className="font-mono text-jm-sm font-medium text-[var(--jm-text)]">
                              {o.orderNo}
                            </span>
                            <OrderStatusBadge status={o.status} />
                            <span className="text-jm-xs text-[var(--jm-text-muted)] tabular-nums">
                              {formatDateShort(o.orderDate)}
                            </span>
                            <span className="ml-auto tabular-nums font-semibold text-[var(--jm-text)]">
                              {formatKRW(o.totalAmount)}
                            </span>
                            <ChevronRight className="size-4 shrink-0 text-[var(--jm-text-subtle)]" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </JmCardContent>
              </JmCard>
              {stats.orderCount > recentOrders.length && (
                <div className="mt-3 text-right">
                  <Link
                    href={`/orders?customerId=${customer.id}`}
                    className="text-jm-sm text-[var(--jm-text-muted)] hover:text-[var(--jm-text)]"
                  >
                    전체 보기 ({stats.orderCount}건) →
                  </Link>
                </div>
              )}
            </JmTabsPanel>

            {/* 수리 */}
            <JmTabsPanel value="repairs" className="pt-2">
              <JmCard>
                <JmCardContent className="p-0">
                  {recentRepairs.length === 0 ? (
                    <JmEmpty
                      icon={<Wrench className="size-8" />}
                      title="수리 이력 없음"
                      description="이 고객으로 접수된 수리 티켓이 아직 없습니다"
                    />
                  ) : (
                    <ul className="divide-y divide-[var(--jm-border)]">
                      {recentRepairs.map((r) => (
                        <li key={r.id}>
                          <Link
                            href={`/repairs?id=${r.id}`}
                            className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-[var(--jm-surface-muted)]"
                          >
                            <span className="font-mono text-jm-sm font-medium text-[var(--jm-text)]">
                              {r.ticketNo}
                            </span>
                            <RepairTypeBadge type={r.type} />
                            {r.workKind === "CUSTOM_BUILD" && (
                              <JmBadge variant="accent" size="sm">
                                리빌드
                              </JmBadge>
                            )}
                            <RepairStatusBadge status={r.status} />
                            <span className="text-jm-xs text-[var(--jm-text-muted)] tabular-nums">
                              {formatDateShort(r.receivedAt)}
                            </span>
                            <span className="ml-auto tabular-nums font-semibold text-[var(--jm-text)]">
                              {r.finalAmount
                                ? formatKRW(r.finalAmount)
                                : "—"}
                            </span>
                            <ChevronRight className="size-4 shrink-0 text-[var(--jm-text-subtle)]" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </JmCardContent>
              </JmCard>
              {stats.repairCount > recentRepairs.length && (
                <div className="mt-3 text-right">
                  <Link
                    href={`/repairs?customerId=${customer.id}`}
                    className="text-jm-sm text-[var(--jm-text-muted)] hover:text-[var(--jm-text)]"
                  >
                    전체 보기 ({stats.repairCount}건) →
                  </Link>
                </div>
              )}
            </JmTabsPanel>

            {/* 임대 */}
            <JmTabsPanel value="rentals" className="pt-2">
              <JmCard>
                <JmCardContent className="p-0">
                  {recentRentals.length === 0 ? (
                    <JmEmpty
                      icon={<Tag className="size-8" />}
                      title="임대 이력 없음"
                      description="이 고객으로 등록된 임대 계약이 아직 없습니다"
                    />
                  ) : (
                    <ul className="divide-y divide-[var(--jm-border)]">
                      {recentRentals.map((r) => (
                        <li key={r.id}>
                          <Link
                            href={`/rentals?id=${r.id}`}
                            className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-[var(--jm-surface-muted)]"
                          >
                            <span className="font-mono text-jm-sm font-medium text-[var(--jm-text)]">
                              {r.rentalNo}
                            </span>
                            <RentalStatusBadge status={r.status} />
                            <span className="text-jm-xs text-[var(--jm-text-muted)] tabular-nums">
                              {formatDateShort(r.startDate)}
                              {" ~ "}
                              {r.endDate ? formatDateShort(r.endDate) : "진행"}
                            </span>
                            <span className="ml-auto tabular-nums font-semibold text-[var(--jm-text)]">
                              {r.finalAmount ? formatKRW(r.finalAmount) : "—"}
                            </span>
                            <ChevronRight className="size-4 shrink-0 text-[var(--jm-text-subtle)]" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </JmCardContent>
              </JmCard>
              {stats.rentalCount > recentRentals.length && (
                <div className="mt-3 text-right">
                  <Link
                    href={`/rentals?customerId=${customer.id}`}
                    className="text-jm-sm text-[var(--jm-text-muted)] hover:text-[var(--jm-text)]"
                  >
                    전체 보기 ({stats.rentalCount}건) →
                  </Link>
                </div>
              )}
            </JmTabsPanel>

            {/* 시리얼 */}
            <JmTabsPanel value="serials" className="pt-2">
              <JmCard>
                <JmCardContent className="p-0">
                  {recentSerials.length === 0 ? (
                    <JmEmpty
                      icon={<Tag className="size-8" />}
                      title="시리얼 라벨 없음"
                      description="이 고객으로 발급된 시리얼 라벨이 아직 없습니다"
                    />
                  ) : (
                    <ul className="divide-y divide-[var(--jm-border)]">
                      {recentSerials.map((s) => (
                        <li
                          key={s.id}
                          className="flex items-center gap-4 px-5 py-3"
                        >
                          <span className="font-mono text-jm-sm font-medium text-[var(--jm-text)]">
                            {s.code}
                          </span>
                          <SerialSourceBadge source={s.source} />
                          <span className="min-w-0 flex-1 truncate text-jm-sm text-[var(--jm-text-muted)]">
                            {s.product?.name ?? "—"}
                            {s.product?.sku && (
                              <span className="ml-2 text-jm-xs text-[var(--jm-text-subtle)]">
                                {s.product.sku}
                              </span>
                            )}
                          </span>
                          <span className="text-jm-xs text-[var(--jm-text-muted)] tabular-nums">
                            보증{" "}
                            {s.warrantyEnds
                              ? `~${formatDateShort(s.warrantyEnds)}`
                              : "—"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </JmCardContent>
              </JmCard>
            </JmTabsPanel>

            {/* 등록 기기 */}
            <JmTabsPanel value="machines" className="pt-2">
              <JmCard>
                <JmCardContent className="p-0">
                  {machines.length === 0 ? (
                    <JmEmpty
                      icon={<Wrench className="size-8" />}
                      title="등록 기기 없음"
                      description="고객이 보유한 기기를 수리 접수 시 등록할 수 있습니다"
                    />
                  ) : (
                    <ul className="divide-y divide-[var(--jm-border)]">
                      {machines.map((m) => (
                        <li
                          key={m.id}
                          className="flex flex-col gap-1 px-5 py-3"
                        >
                          <div className="flex items-center gap-2">
                            <Wrench className="size-3.5 shrink-0 text-[var(--jm-text-muted)]" />
                            <span className="font-medium text-[var(--jm-text)]">
                              {m.name}
                            </span>
                          </div>
                          {m.memo && (
                            <p className="pl-5 text-jm-xs text-[var(--jm-text-muted)]">
                              {m.memo}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </JmCardContent>
              </JmCard>
            </JmTabsPanel>

            {/* 노트 — 업무 노트 허브와 연동 (출처: 고객). 구 CustomerNote 는 Note 로 흡수됨 */}
            <JmTabsPanel value="notes" className="pt-2">
              <JmCard>
                <JmCardContent>
                  <NoteTimeline
                    sourceType="CUSTOMER"
                    sourceId={id}
                    sourceLabel={customer.name}
                  />
                </JmCardContent>
              </JmCard>
            </JmTabsPanel>
          </JmTabs>

          {/* 하단 메타 */}
          <div className="text-jm-xs text-[var(--jm-text-subtle)]">
            등록일 {formatDateShort(customer.createdAt)} · ID {customer.id}
          </div>
        </JmContainer>

        {/* 수정 시트 */}
        <CustomerSheet
          open={editOpen}
          onOpenChange={setEditOpen}
          editTarget={customer}
          onSaved={invalidate}
        />

        {/* 비활성화 다이얼로그 */}
        <JmDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <JmDialogContent size="sm">
            <JmDialogHeader>
              <JmDialogTitle>고객 비활성화</JmDialogTitle>
            </JmDialogHeader>
            <JmDialogBody>
              <p className="text-jm-sm text-[var(--jm-text)]">
                <span className="font-semibold">{customer.name}</span> 고객을
                비활성화 합니다.
              </p>
              <p className="mt-2 text-jm-xs text-[var(--jm-text-muted)]">
                비활성화한 고객은 목록 상단에서 숨겨지고, 신규 거래·견적에 선택할
                수 없습니다. 기존 거래 이력과 원장은 그대로 유지됩니다.
              </p>
              {outstanding > 0 && (
                <p className="mt-3 rounded-lg bg-[var(--jm-warning-bg)] px-3 py-2 text-jm-xs text-[var(--jm-warning-fg)]">
                  ⚠ 미수금 {formatKRW(outstanding)} 이 남아있습니다 — 회수 후
                  비활성화를 권장합니다
                </p>
              )}
            </JmDialogBody>
            <JmDialogFooter>
              <JmButton
                variant="outline"
                onClick={() => setDeleteOpen(false)}
                disabled={deleteMutation.isPending}
              >
                취소
              </JmButton>
              <JmButton
                variant="danger"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending && (
                  <JmSpinner size="sm" tone="inverted" />
                )}
                비활성화
              </JmButton>
            </JmDialogFooter>
          </JmDialogContent>
        </JmDialog>
      </div>
    </CustomersThemeScope>
  );
}
