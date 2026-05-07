"use client";

import { ArrowLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { JmBadge, JmCard, JmCardContent, JmCardHeader, JmCardTitle } from "@/jm";
import { StatusBadge, StatusFlowGuide } from "../_parts";
import type { OrderClaimType } from "../_types";

/**
 * 주문 시스템 가이드 페이지.
 * 워크보드 헤더의 [도움말] 버튼에서 진입.
 * 다른 매장 직원·신규 사용자가 주문/반품/교환의 모든 흐름을 한 곳에서 이해하도록.
 */
export default function OrderHelpPage() {
  return (
    <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
      <div className="border-b border-[var(--jm-border)] bg-[var(--jm-surface)] px-5 py-3">
        <div className="flex items-center gap-2">
          <Link
            href="/orders"
            className="inline-flex items-center gap-1 text-[12px] text-[var(--jm-text-muted)] hover:text-[var(--jm-text)]"
          >
            <ArrowLeft className="size-3.5" />
            워크보드로
          </Link>
        </div>
        <h1 className="mt-1 text-[18px] font-semibold">주문 시스템 가이드</h1>
        <p className="mt-0.5 text-[12px] text-[var(--jm-text-muted)]">
          매장 운영자와 신규 직원이 주문/반품/교환의 모든 흐름과 결제 처리 방식을
          한 곳에서 확인하도록 정리한 페이지입니다.
        </p>
      </div>

      <div className="mx-auto w-full max-w-4xl space-y-6 p-5">
        <Toc />
        <SectionOverview />
        <SectionShipping />
        <SectionRefund />
        <SectionExchange />
        <SectionPayment />
        <SectionCancel />
        <SectionPitfalls />
      </div>
    </div>
  );
}

// ─────────── 목차

function Toc() {
  const items = [
    { href: "#overview", label: "1. 개요 — 3축 모델" },
    { href: "#shipping", label: "2. 출고 흐름 (5단계)" },
    { href: "#refund", label: "3. 반품 흐름 (5단계)" },
    { href: "#exchange", label: "4. 교환 흐름 + 새 주문" },
    { href: "#payment", label: "5. 결제 상태 (paymentStatus)" },
    { href: "#cancel", label: "6. 취소 흐름" },
    { href: "#pitfalls", label: "7. 자주 헷갈리는 포인트" },
  ];
  return (
    <JmCard>
      <JmCardHeader>
        <JmCardTitle>목차</JmCardTitle>
      </JmCardHeader>
      <JmCardContent>
        <ul className="space-y-1 text-[13px]">
          {items.map((it) => (
            <li key={it.href}>
              <a
                href={it.href}
                className="inline-flex items-center gap-1 text-[var(--jm-text)] hover:text-[var(--jm-action)] hover:underline underline-offset-2"
              >
                <ChevronRight className="size-3 text-[var(--jm-text-subtle)]" />
                {it.label}
              </a>
            </li>
          ))}
        </ul>
      </JmCardContent>
    </JmCard>
  );
}

// ─────────── 1. 개요

function SectionOverview() {
  return (
    <Section id="overview" title="1. 개요 — 3축 모델">
      <p>
        한 주문은 <strong>세 가지 독립적 축</strong>으로 동시에 추적됩니다.
        같은 주문이 동시에 여러 축에서 다른 상태일 수 있어요.
      </p>
      <table className="mt-3 w-full table-fixed text-[13px]">
        <thead>
          <tr className="border-b border-[var(--jm-border)] text-left text-[12px] text-[var(--jm-text-muted)]">
            <th className="w-[80px] py-2">축</th>
            <th className="w-[140px] py-2">필드</th>
            <th className="py-2">추적 대상</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-[var(--jm-border-subtle)]">
            <td className="py-2 font-medium">출고</td>
            <td className="py-2 font-mono text-[12px]">status</td>
            <td className="py-2">물리적 흐름 — 재고 위치, 손님 인도 여부</td>
          </tr>
          <tr className="border-b border-[var(--jm-border-subtle)]">
            <td className="py-2 font-medium">결제</td>
            <td className="py-2 font-mono text-[12px]">paymentStatus</td>
            <td className="py-2">재무 흐름 — 입금·환불·매출취소 추적</td>
          </tr>
          <tr>
            <td className="py-2 font-medium">클레임</td>
            <td className="py-2 font-mono text-[12px]">claimType / claimReason</td>
            <td className="py-2">의도 — 환불인지 교환인지, 누가 책임인지</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-4 rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] p-3">
        <p className="mb-2 text-[12px] font-medium text-[var(--jm-text-subtle)]">
          예시
        </p>
        <ul className="space-y-1 text-[12px]">
          <li>
            <code className="rounded bg-[var(--jm-surface)] px-1 py-0.5">
              출고대기
            </code>{" "}
            +{" "}
            <code className="rounded bg-[var(--jm-surface)] px-1 py-0.5">
              외상
            </code>{" "}
            → 외상으로 출고 진행 중. 손님 결제는 인도 후 입금
          </li>
          <li>
            <code className="rounded bg-[var(--jm-surface)] px-1 py-0.5">
              배송완료
            </code>{" "}
            +{" "}
            <code className="rounded bg-[var(--jm-surface)] px-1 py-0.5">
              결제완료
            </code>{" "}
            → 정상 종결
          </li>
          <li>
            <code className="rounded bg-[var(--jm-surface)] px-1 py-0.5">
              검수완료
            </code>{" "}
            +{" "}
            <code className="rounded bg-[var(--jm-surface)] px-1 py-0.5">
              환불진행
            </code>{" "}
            +{" "}
            <code className="rounded bg-[var(--jm-surface)] px-1 py-0.5">
              불량
            </code>{" "}
            → 검수 통과한 불량 반품, 환불 PG 처리 대기
          </li>
        </ul>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-[12px] font-medium text-[var(--jm-text-subtle)]">
          전체 흐름 한눈에
        </p>
        <div className="overflow-hidden rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface)]">
          <StatusFlowGuide />
        </div>
      </div>
    </Section>
  );
}

// ─────────── 2. 출고 흐름

function SectionShipping() {
  return (
    <Section id="shipping" title="2. 출고 흐름 (5단계)">
      <p>
        주문이 들어와 손님 인도까지 진행되는 정상 흐름. 색은 <strong>파랑</strong>{" "}
        (info) 톤으로 통일되어 있고 마지막 배송완료만 초록(success).
      </p>

      <StepRow
        no={1}
        badge={<StatusBadge status="PENDING" />}
        title="주문 / 접수"
        what="외부 채널이 자동 import 한 주문(매장 입장에서 '주문')이거나, 매장이 POS·B2B 등록 시 직접 등록한 '접수' 단계."
        actions={[
          { who: "매장", what: "행 클릭 → [출고대기]" },
        ]}
        sideEffect="이 단계는 재고 미차감. 조용한 대기 상태로 워크보드에 진입."
      />
      <StepRow
        no={2}
        badge={<StatusBadge status="PREPARING" />}
        title="출고대기"
        what="주문 확정 → 재고가 자동 차감(FIFO + LotConsumption). 포장·송장 발급 대기. 취소 가능 마지막 단계."
        actions={[
          { who: "매장", what: "포장 완료 후 [출고확정]" },
          { who: "매장", what: "취소 가능: [취소] 클릭 시 재고 복원 + 결제건은 환불(또는 매출취소)" },
        ]}
        sideEffect="재고 차감 — 다른 주문에서 같은 상품 부족 가능성. 차감 시점에 cost snapshot 도 함께 기록 (마진 리포트 정확도)."
      />
      <StepRow
        no={3}
        badge={<StatusBadge status="PREPARING_PACKED" />}
        title="출고확정"
        what="송장번호 발급. 포장·라벨 부착 완료, 발송 직전 상태."
        actions={[
          { who: "매장", what: "[발송] 클릭 → 송장 정보 입력 후 SHIPPED" },
        ]}
        sideEffect={
          <>
            <strong>이 시점부터 취소 불가.</strong> 송장이 발급된 상태라
            물리적으로 회수해 반품 흐름으로 처리해야 함.
          </>
        }
      />
      <StepRow
        no={4}
        badge={<StatusBadge status="SHIPPED" />}
        title="배송중"
        what="택배사 인계 또는 자체 배달 출발."
        actions={[
          { who: "매장", what: "손님 인도 확인 후 [배송완료]" },
          {
            who: "자동",
            what: "외부 채널 주문이면 송장번호가 채널에도 자동 push (Outbound hook)",
          },
        ]}
      />
      <StepRow
        no={5}
        badge={<StatusBadge status="COMPLETED" />}
        title="배송완료"
        what="손님 인도 종결. 정상 케이스의 마지막 단계."
        actions={[
          {
            who: "매장",
            what: "필요 시 [반품/교환 요청] 으로 클레임 절차 시작",
          },
          { who: "매장", what: "[즉시 반품] 으로 매장 즉석 환불 가능 (단축 경로)" },
        ]}
      />
    </Section>
  );
}

// ─────────── 3. 반품 흐름

function SectionRefund() {
  return (
    <Section id="refund" title="3. 반품 흐름 (5단계)">
      <p>
        손님이 반품 요청 → 매장 결정 → 회수 → 검수 → 종결. 색은{" "}
        <strong>노랑</strong> (warning) 톤으로 통일.
      </p>

      <StepRow
        no={1}
        badge={
          <StatusBadge status="RETURN_REQUESTED" claimType={REFUND_CTX} />
        }
        title="반품요청"
        what="손님이 반품 요청을 넣었거나 매장이 손님 응대 중 등록. claimType=REFUND, claimReason 입력 (불량/변심/사이즈 등)."
        actions={[
          {
            who: "매장",
            what: "[수락] — 반품 받겠다 / [반려] — 반품 거부 (재고 그대로) / [요청 취소] — 손님 자진 취소",
          },
        ]}
        sideEffect="재고는 아직 복원 안 됨. 원본 결제도 그대로."
      />
      <StepRow
        no={2}
        badge={
          <StatusBadge status="RETURN_ACCEPTED" claimType={REFUND_CTX} />
        }
        title="반품 회수대기"
        what="매장 수락. 손님 반송 또는 매장 회수 라벨 발급 후 물품 도착 대기."
        actions={[
          { who: "매장", what: "물품 도착 시 [회수완료]" },
          {
            who: "자동",
            what: "외부 채널이면 채널 시스템에 acceptReturn 자동 통보",
          },
        ]}
      />
      <StepRow
        no={3}
        badge={
          <StatusBadge status="RETURN_COLLECTED" claimType={REFUND_CTX} />
        }
        title="회수완료"
        what="물품 매장 도착. 검수 대기."
        actions={[{ who: "매장", what: "포장 상태·기능·외관 검수 후 [검수완료]" }]}
        sideEffect={
          <>
            검수 결과 불량(포장 손상·사용 흔적 등) 시 별도 분기 처리 가능 — <em>현재는 검수 반려 분기 미구현</em>, 후속 작업 예정.
          </>
        }
      />
      <StepRow
        no={4}
        badge={
          <StatusBadge status="RETURN_INSPECTED" claimType={REFUND_CTX} />
        }
        title="검수완료"
        what="검수 통과. 환불 절차 시작 (PG/은행 처리 대기)."
        actions={[
          { who: "매장", what: "[반품완료] — 환불 처리 확정" },
        ]}
        sideEffect={
          <>
            <strong>paymentStatus</strong> 가{" "}
            <code className="rounded bg-[var(--jm-surface)] px-1 py-0.5">
              결제완료
            </code>
            였다면 자동으로{" "}
            <code className="rounded bg-[var(--jm-surface)] px-1 py-0.5">
              환불진행(REFUND_PENDING)
            </code>{" "}
            으로 표시됨 — 환불 절차 진행 중임을 결제 축에서 인지 가능.
          </>
        }
      />
      <StepRow
        no={5}
        badge={<StatusBadge status="RETURNED" claimType={REFUND_CTX} />}
        title="반품완료"
        what="재고 복원 + 환불 종결. 종결 상태이므로 워크보드에서 빠짐."
        sideEffect={
          <ul className="list-inside list-disc space-y-0.5">
            <li>
              <strong>재고</strong>: LotConsumption 역순 복원 + Inventory 증가
            </li>
            <li>
              <strong>결제 (PAID)</strong>:{" "}
              <code className="rounded bg-[var(--jm-surface)] px-1 py-0.5">
                환불완료(REFUNDED)
              </code>
            </li>
            <li>
              <strong>결제 (UNPAID/외상)</strong>:{" "}
              <code className="rounded bg-[var(--jm-surface)] px-1 py-0.5">
                매출취소(SALES_CANCELLED)
              </code>{" "}
              — 환불 없이 customer ledger 잔액 차감
            </li>
          </ul>
        }
      />
    </Section>
  );
}

// ─────────── 4. 교환 흐름

function SectionExchange() {
  return (
    <Section id="exchange" title="4. 교환 흐름 + 새 주문 (5단계 + 새 출고)">
      <p>
        반품 흐름과 단계는 같지만 종결이 다릅니다 — 환불 대신 <strong>새 주문 자동 생성</strong>.
        색은 <strong>보라</strong> (accent) 톤으로 통일되어 반품과 시각 분리.
      </p>

      <div className="mt-3 rounded-md border border-[var(--jm-accent-bg)] bg-[var(--jm-accent-bg)] p-3 text-[12px] text-[var(--jm-accent-fg)]">
        <strong>반품 5단계와 동일</strong>한 진행을 따릅니다 — 요청 → 수락 → 회수
        → 검수 → 종결. 단, claimType 이{" "}
        <code className="rounded bg-[var(--jm-surface)] px-1 py-0.5">
          EXCHANGE_SAME
        </code>{" "}
        또는{" "}
        <code className="rounded bg-[var(--jm-surface)] px-1 py-0.5">
          EXCHANGE_DIFFERENT
        </code>{" "}
        이라 라벨이 "교환 ..." 으로 표시되고 색은 보라.
      </div>

      <StepRow
        no={5}
        badge={<StatusBadge status="EXCHANGED" />}
        title="교환완료 + 새 주문 자동 생성"
        what="검수 통과 후 [교환완료] 클릭 → 새 주문이 자동 생성됨."
        sideEffect={
          <>
            <p className="mb-2">
              <strong>원본 주문 종결:</strong>
            </p>
            <ul className="list-inside list-disc space-y-0.5">
              <li>재고 복원 (반품과 동일)</li>
              <li>
                <strong>paymentStatus 그대로 유지</strong> — 차액은 새 주문에서
                정산
              </li>
              <li>
                새 주문번호는{" "}
                <code className="rounded bg-[var(--jm-surface)] px-1 py-0.5">
                  -EX
                </code>{" "}
                접미사 (예:{" "}
                <code className="rounded bg-[var(--jm-surface)] px-1 py-0.5">
                  ORD250507-AB12-EX
                </code>
                )
              </li>
            </ul>
            <p className="mt-2 mb-1">
              <strong>새 주문 (-EX) 의 항목 채우기:</strong>
            </p>
            <ul className="list-inside list-disc space-y-0.5">
              <li>
                <strong>EXCHANGE_SAME (같은 상품)</strong>: 항목 자동 복제,
                paymentStatus=PAID, totalAmount=원본 — 매장은 단순 재발송
              </li>
              <li>
                <strong>EXCHANGE_DIFFERENT (다른 상품)</strong>: 빈 항목,
                paymentStatus=UNPAID, totalAmount=0. 매장이 OrderItem 편집 UI 로
                새 항목 등록 → 차액 자동 계산 → 손님 추가 결제 또는 매장 환불
              </li>
            </ul>
            <p className="mt-2">
              새 주문은 일반 출고 흐름을 따름 (출고대기 → 출고확정 → ...). 단{" "}
              <strong>색은 보라</strong>로 표시되어 일반 주문과 시각 분리.
            </p>
          </>
        }
      />

      <div className="mt-4">
        <p className="mb-2 text-[12px] font-medium text-[var(--jm-text-subtle)]">
          마진 리포트 정합성
        </p>
        <p className="text-[13px]">
          교환 발송 새 주문(-EX)은 <strong>매출 중복 인식 방지</strong>를 위해
          마진 리포트에서 자동 제외됩니다 (
          <code className="rounded bg-[var(--jm-surface)] px-1 py-0.5">
            exchangedFromOrders.length &gt; 0
          </code>{" "}
          필터). 따라서 같은 상품을 두 번 매출로 잡지 않음.
        </p>
      </div>
    </Section>
  );
}

// ─────────── 5. 결제

function SectionPayment() {
  return (
    <Section id="payment" title="5. 결제 상태 (paymentStatus)">
      <p>
        출고 축과 별개로 추적되는 <strong>결제 축</strong>. 외상 출고, 환불 진행,
        매출 취소 등을 표현.
      </p>

      <table className="mt-3 w-full text-[13px]">
        <thead>
          <tr className="border-b border-[var(--jm-border)] text-left text-[12px] text-[var(--jm-text-muted)]">
            <th className="w-[140px] py-2">상태</th>
            <th className="py-2">의미 / 전이 시점</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-[var(--jm-border-subtle)]">
            <td className="py-2 font-medium text-[var(--jm-danger-fg)]">외상 (UNPAID)</td>
            <td className="py-2">
              주문 시 결제수단이 UNPAID 또는 미입력. 손님이 나중에 결제.
              customer ledger 에 잔액 누적.
            </td>
          </tr>
          <tr className="border-b border-[var(--jm-border-subtle)]">
            <td className="py-2 font-medium text-[var(--jm-success-fg)]">결제완료 (PAID)</td>
            <td className="py-2">
              주문 시 결제 완료. POS 결제·외부 채널 import 시 기본값.{" "}
              <code className="rounded bg-[var(--jm-surface)] px-1 py-0.5">
                customerPayment
              </code>{" "}
              등록 시 외상 주문이 FIFO 로 자동 PAID 전이.
            </td>
          </tr>
          <tr className="border-b border-[var(--jm-border-subtle)]">
            <td className="py-2 font-medium text-[var(--jm-warning-fg)]">환불진행 (REFUND_PENDING)</td>
            <td className="py-2">
              검수완료 단계 진입 시 자동 표시. PG/은행 환불 처리 대기 중. 매장
              운영자가 환불 절차 진행 중임을 결제 축에서 인지.
            </td>
          </tr>
          <tr className="border-b border-[var(--jm-border-subtle)]">
            <td className="py-2 font-medium">환불완료 (REFUNDED)</td>
            <td className="py-2">
              반품완료 시 PAID/REFUND_PENDING 였던 주문이 자동 전이. 손님 통장
              입금 완료를 의미.
            </td>
          </tr>
          <tr className="border-b border-[var(--jm-border-subtle)]">
            <td className="py-2 font-medium">매출취소 (SALES_CANCELLED)</td>
            <td className="py-2">
              <strong>외상(UNPAID) 주문 반품 시 자동 적용.</strong> 환불할 돈이
              없으니 환불 대신 매출 자체를 취소. customer ledger 의 SALE 잔액은
              별도 조정 (수동 또는 자동화 추후 도입).
            </td>
          </tr>
          <tr>
            <td className="py-2 font-medium">부분환불 (PARTIAL_REFUND)</td>
            <td className="py-2">
              enum 정의만 있음. 부분 반품 도입 시 사용 (현재 미구현 — 후속).
            </td>
          </tr>
        </tbody>
      </table>
    </Section>
  );
}

// ─────────── 6. 취소

function SectionCancel() {
  return (
    <Section id="cancel" title="6. 취소 흐름">
      <p>
        취소는 <strong>출고대기까지만</strong> 가능합니다. 출고확정(송장 발급) 이후엔
        취소 대신 <strong>반품 흐름</strong>으로 처리해야 합니다.
      </p>

      <table className="mt-3 w-full text-[13px]">
        <thead>
          <tr className="border-b border-[var(--jm-border)] text-left text-[12px] text-[var(--jm-text-muted)]">
            <th className="w-[180px] py-2">현재 상태</th>
            <th className="w-[100px] py-2">취소 가능?</th>
            <th className="py-2">대안</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-[var(--jm-border-subtle)]">
            <td className="py-2">PENDING (주문/접수)</td>
            <td className="py-2 text-[var(--jm-success-fg)]">✓ 가능</td>
            <td className="py-2 text-[var(--jm-text-muted)]">재고 미차감이라 단순 상태 변경</td>
          </tr>
          <tr className="border-b border-[var(--jm-border-subtle)]">
            <td className="py-2">PREPARING (출고대기)</td>
            <td className="py-2 text-[var(--jm-success-fg)]">✓ 가능</td>
            <td className="py-2 text-[var(--jm-text-muted)]">재고 자동 복원 + 결제건 환불/매출취소</td>
          </tr>
          <tr className="border-b border-[var(--jm-border-subtle)]">
            <td className="py-2">PREPARING_PACKED (출고확정)</td>
            <td className="py-2 text-[var(--jm-danger-fg)]">✗ 불가</td>
            <td className="py-2 text-[var(--jm-text-muted)]">
              송장 발급 후라 회수 필요 → 반품 흐름
            </td>
          </tr>
          <tr className="border-b border-[var(--jm-border-subtle)]">
            <td className="py-2">SHIPPED / COMPLETED</td>
            <td className="py-2 text-[var(--jm-danger-fg)]">✗ 불가</td>
            <td className="py-2 text-[var(--jm-text-muted)]">
              반품 요청 또는 즉시 반품
            </td>
          </tr>
        </tbody>
      </table>
    </Section>
  );
}

// ─────────── 7. 자주 헷갈리는 포인트

function SectionPitfalls() {
  return (
    <Section id="pitfalls" title="7. 자주 헷갈리는 포인트">
      <Pitfall title='"출고대기" vs "출고확정" 차이'>
        출고대기 = 재고 차감만 됨 (포장 시작 가능). 출고확정 = 포장·송장 입력
        완료 (발송 직전). 매장이 두 번 클릭하는 건 운영 정확도 — 누가 언제 포장
        끝냈는지 추적.
      </Pitfall>
      <Pitfall title="검수완료 전후 paymentStatus 차이">
        검수완료 진입 시 PAID → REFUND_PENDING. 환불 절차 시작 표시. 반품완료 시
        REFUNDED 로 최종 전이.
      </Pitfall>
      <Pitfall title="외상 주문 반품은 환불 X, 매출취소">
        UNPAID 주문은 받을 돈이 없으니 환불 의미 없음. paymentStatus 가
        SALES_CANCELLED 로 표시. customer ledger 의 SALE 잔액은 별도 조정 필요.
      </Pitfall>
      <Pitfall title="-EX 주문 = 교환 발송용 새 주문">
        주문번호 끝이 -EX 면 교환 발송용. 색이 보라색으로 다름. 마진 리포트에서
        자동 제외 — 매출 중복 인식 방지.
      </Pitfall>
      <Pitfall title="EXCHANGE_DIFFERENT 새 주문은 빈 항목으로 생성">
        다른 상품 교환 시 새 주문은 항목이 비어있음 (totalAmount=0). 매장이
        OrderItem 편집 UI 로 새 항목 등록 → 차액 자동 계산 → 손님에게 차액 결제
        요청 또는 매장이 차액 환불.
      </Pitfall>
      <Pitfall title="반품/교환 흐름 단축 — 즉시 반품">
        매장에서 손님이 들고 와서 즉석 환불 처리할 땐 COMPLETED → [즉시 반품] →
        RETURNED. 5단계 안 거쳐도 됨. claimType=REFUND 자동.
      </Pitfall>
      <Pitfall title="채널 라벨 동적">
        외부 채널 (쿠팡·네이버) 주문은 PENDING 라벨이 "주문". 매장 직접 등록은
        "접수". 같은 PENDING 이지만 source 에 따라 다름.
      </Pitfall>
      <Pitfall title="반품과 교환 색 차이">
        반품(claimType=REFUND) = 노랑, 교환(claimType=EXCHANGE_*) = 보라. 같은
        단계여도 색만 보고 흐름 즉시 식별 가능.
      </Pitfall>
    </Section>
  );
}

// ─────────── helpers

const REFUND_CTX: OrderClaimType = "REFUND";

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-4">
      <JmCard>
        <JmCardHeader>
          <JmCardTitle>{title}</JmCardTitle>
        </JmCardHeader>
        <JmCardContent className="space-y-2 text-[13px] text-[var(--jm-text)]">
          {children}
        </JmCardContent>
      </JmCard>
    </section>
  );
}

function StepRow({
  no,
  badge,
  title,
  what,
  actions,
  sideEffect,
}: {
  no: number;
  badge: React.ReactNode;
  title: string;
  what: string;
  actions?: Array<{ who: string; what: string }>;
  sideEffect?: React.ReactNode;
}) {
  return (
    <div className="mt-4 rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--jm-surface-muted)] text-[12px] font-semibold text-[var(--jm-text-muted)]">
          {no}
        </span>
        {badge}
        <span className="text-[14px] font-medium">{title}</span>
      </div>
      <p className="mt-2 text-[13px] text-[var(--jm-text)]">{what}</p>
      {actions && actions.length > 0 && (
        <div className="mt-2">
          <p className="text-[11px] font-medium text-[var(--jm-text-subtle)]">
            액션
          </p>
          <ul className="mt-1 space-y-0.5 text-[12px]">
            {actions.map((a, i) => (
              <li key={i}>
                <JmBadge variant="default" size="sm" shape="square">
                  {a.who}
                </JmBadge>
                <span className="ml-1.5">{a.what}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {sideEffect && (
        <div className="mt-2 rounded border border-[var(--jm-border-subtle)] bg-[var(--jm-surface-muted)] p-2 text-[12px] text-[var(--jm-text-muted)]">
          <p className="mb-1 font-medium text-[var(--jm-text-subtle)]">
            부수효과
          </p>
          {sideEffect}
        </div>
      )}
    </div>
  );
}

function Pitfall({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3 rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface)] p-3">
      <p className="text-[13px] font-medium">{title}</p>
      <p className="mt-1 text-[12px] text-[var(--jm-text-muted)]">{children}</p>
    </div>
  );
}
