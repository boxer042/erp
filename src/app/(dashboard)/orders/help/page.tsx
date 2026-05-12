"use client";

import { ArrowLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { JmBadge, JmCard, JmCardContent, JmCardHeader, JmCardTitle } from "@/jm";
import {
  PartialProgress,
  ShipmentSummaryChip,
  StatusBadge,
  StatusFlowGuide,
} from "../_parts";
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
            className="inline-flex items-center gap-1 text-jm-xs text-[var(--jm-text-muted)] hover:text-[var(--jm-text)]"
          >
            <ArrowLeft className="size-3.5" />
            워크보드로
          </Link>
        </div>
        <h1 className="mt-1 text-jm-xl font-semibold">주문 시스템 가이드</h1>
        <p className="mt-0.5 text-jm-xs text-[var(--jm-text-muted)]">
          매장 운영자와 신규 직원이 주문/반품/교환의 모든 흐름과 결제 처리 방식을
          한 곳에서 확인하도록 정리한 페이지입니다.
        </p>
      </div>

      <div className="mx-auto w-full max-w-4xl space-y-6 p-5">
        <Toc />
        <SectionOverview />
        <SectionShipping />
        <SectionWorkboard />
        <SectionPartial />
        <SectionOptions />
        <SectionRefund />
        <SectionExchange />
        <SectionPayment />
        <SectionCancel />
        <SectionFulfillmentTools />
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
    { href: "#workboard", label: "2-2. 워크보드 필터·검색 사용법" },
    { href: "#partial", label: "3. 부분 처리 / 분할 발송 정책" },
    { href: "#options", label: "4. 옵션 도메인 — SWAP / ADDON / OPTION_PARENT" },
    { href: "#addon", label: "4-3. ADDON 도메인 — 추가구매 추천 (BundleProduct)" },
    { href: "#refund", label: "5. 반품 흐름 (6단계)" },
    { href: "#exchange", label: "6. 교환 흐름 + 새 주문" },
    { href: "#payment", label: "7. 결제 상태 (paymentStatus)" },
    { href: "#cancel", label: "8. 취소 흐름" },
    { href: "#fulfillment-tools", label: "9. 출고 보조 도구 — 변형 SKU·송장·운임" },
    { href: "#pitfalls", label: "10. 자주 헷갈리는 포인트" },
  ];
  return (
    <JmCard>
      <JmCardHeader>
        <JmCardTitle>목차</JmCardTitle>
      </JmCardHeader>
      <JmCardContent>
        <ul className="space-y-1 text-jm-sm">
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
      <table className="mt-3 w-full table-fixed text-jm-sm">
        <thead>
          <tr className="border-b border-[var(--jm-border)] text-left text-jm-xs text-[var(--jm-text-muted)]">
            <th className="w-[80px] py-2">축</th>
            <th className="w-[140px] py-2">필드</th>
            <th className="py-2">추적 대상</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-[var(--jm-border-subtle)]">
            <td className="py-2 font-medium">출고</td>
            <td className="py-2 font-mono text-jm-xs">status</td>
            <td className="py-2">물리적 흐름 — 재고 위치, 손님 인도 여부</td>
          </tr>
          <tr className="border-b border-[var(--jm-border-subtle)]">
            <td className="py-2 font-medium">결제</td>
            <td className="py-2 font-mono text-jm-xs">paymentStatus</td>
            <td className="py-2">재무 흐름 — 입금·환불·매출취소 추적</td>
          </tr>
          <tr>
            <td className="py-2 font-medium">클레임</td>
            <td className="py-2 font-mono text-jm-xs">claimType / claimReason</td>
            <td className="py-2">의도 — 환불인지 교환인지, 누가 책임인지</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-4 rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] p-3">
        <p className="mb-2 text-jm-xs font-medium text-[var(--jm-text-subtle)]">
          예시
        </p>
        <ul className="space-y-1 text-jm-xs">
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
        <p className="mb-2 text-jm-xs font-medium text-[var(--jm-text-subtle)]">
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

// ─────────── 2-2. 워크보드 필터·검색 사용법

function SectionWorkboard() {
  return (
    <Section id="workboard" title="2-2. 워크보드 필터·검색 사용법">
      <p>
        워크보드(<code className="text-jm-2xs">/orders</code>)는 매장이 매일 가장
        많이 보는 화면. 화면이 좁아도 모든 필터에 접근 가능하도록 두 가지 진입
        방식을 제공합니다.
      </p>

      <h4 className="mt-4 text-jm-base font-semibold">상단 KPI 카드 (5개)</h4>
      <p>
        지연 · 오늘 출고 · 발송 중 · 예정일 미정 · 반품 처리. 각 카드는 클릭
        가능한 토글 필터. 카드 누르면 해당 그룹만 워크보드에 노출, 다시 누르면
        해제. 여러 카드를 동시에 활성화 가능 (OR 조건).
      </p>

      <h4 className="mt-4 text-jm-base font-semibold">툴바 필터 4종</h4>
      <ul className="ml-5 list-disc space-y-1">
        <li>
          <strong>검색 입력</strong> — 주문번호 · 손님 이름 · 채널 주문번호.
          종결된 주문(COMPLETED/RETURNED/EXCHANGED/CANCELLED)도 검색 시 결과에
          포함 (운영자 과거 조회용)
        </li>
        <li>
          <strong>채널 필터</strong> — &ldquo;전체 / 오프라인 / 외부 / 채널별&rdquo;.
          채널별로 좁혀서 보기
        </li>
        <li>
          <strong>종결 포함 토글</strong> — 검색어 없이도 종결 주문을 일반 리스트에
          포함시킬지
        </li>
        <li>
          <strong>운영 빈도 단축 필터 (칩)</strong> — 자주 쓰는 그룹 빠르게.
          KPI 카드와 같은 효과
        </li>
      </ul>

      <h4 className="mt-4 text-jm-base font-semibold">신규 주문 등록</h4>
      <p>
        우측 상단 <code className="text-jm-2xs">[+ 신규 주문]</code> — B2B 수동 주문
        등록용 (POS 결제·외부 채널 import·견적서 전환과 별도 진입점). 등록 시 status =
        PENDING, 재고 차감 안 됨.
      </p>

      <h4 className="mt-4 text-jm-base font-semibold">상세 시트 진입</h4>
      <ul className="ml-5 list-disc space-y-1">
        <li>행 클릭 → 우측 시트 슬라이드 — 단건 처리 (액션 footer 의 버튼)</li>
        <li>
          품목 단위 행(분할 발송 / 부분 반품 시) 클릭 → 같은 시트 + 해당 라인
          하이라이트
        </li>
      </ul>

      <h4 className="mt-4 text-jm-base font-semibold">반품 처리 전용 뷰</h4>
      <p>
        <code className="text-jm-2xs">/orders/claims</code> — RETURN_*
        흐름만 모은 batch 처리 페이지. 4 그룹 KPI (요청/회수대기/회수중/검수) +
        행 inline 액션. 반품 건수가 많을 때 클레임 일괄 처리에 효율적.
      </p>
    </Section>
  );
}

// ─────────── 3. 부분 처리 / 분할 발송 정책

function SectionPartial() {
  return (
    <Section id="partial" title="3. 부분 처리 / 분할 발송 정책">
      <p>
        한 주문에 여러 품목·수량이 있을 때 매장은{" "}
        <strong>일부만 먼저 처리</strong>할 수 있습니다. 출고·반품·교환 모두 부분
        처리가 가능하며, 워크보드에 진행 상황이 progress bar 로 표시됩니다.
      </p>

      <div className="mt-3 rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] p-3">
        <p className="mb-2 text-jm-xs font-medium text-[var(--jm-text-subtle)]">
          진행 중 progress bar — 고객/항목 셀에 표시
        </p>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3 text-jm-xs">
            <span className="w-[110px] text-[var(--jm-text-muted)]">출고 진행</span>
            <PartialProgress
              status="PREPARING"
              totalQty={3}
              shippedQty={1}
              returnedQty={0}
            />
          </div>
          <div className="flex items-center gap-3 text-jm-xs">
            <span className="w-[110px] text-[var(--jm-text-muted)]">반품 진행</span>
            <PartialProgress
              status="COMPLETED"
              totalQty={5}
              shippedQty={5}
              returnedQty={1}
            />
          </div>
          <div className="flex items-center gap-3 text-jm-xs">
            <span className="w-[110px] text-[var(--jm-text-muted)]">분할 발송 이력</span>
            <ShipmentSummaryChip shipmentCount={2} status="SHIPPED" />
          </div>
        </div>
      </div>

      <h3 className="mt-5 text-jm-sm font-semibold">
        ⚠️ 시스템이 의미하는 "분할 발송"
      </h3>
      <p>
        리스트의 <code className="rounded bg-[var(--jm-surface-muted)] px-1 py-0.5">완료 N/N · 분할 N회</code>{" "}
        표시는 <strong>주문이 몇 회차에 나눠 발송되었는지</strong>를 의미합니다.{" "}
        다음 두 케이스를 모두 포함합니다:
      </p>
      <table className="mt-3 w-full table-fixed text-jm-sm">
        <thead>
          <tr className="border-b border-[var(--jm-border)] text-left text-jm-xs text-[var(--jm-text-muted)]">
            <th className="w-[120px] py-2">유형</th>
            <th className="py-2">설명</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-[var(--jm-border-subtle)]">
            <td className="py-2 align-top font-medium">수량 분할</td>
            <td className="py-2 align-top">
              한 품목의 일부 수량 먼저 발송 → 잔여 추후 발송. 예: A품목 10개
              주문 → 8개 먼저 + 2개 나중. 재고 입고 대기 등 매장 사정으로 흔히 발생
            </td>
          </tr>
          <tr>
            <td className="py-2 align-top font-medium">라인 분할</td>
            <td className="py-2 align-top">
              카트의 다른 품목을 별도 회차로 발송. 예: 카트{" "}
              <code className="rounded bg-[var(--jm-surface-muted)] px-1 py-0.5">[A:3, B:2]</code>{" "}
              에서 A 먼저 + B 나중. 각 라인은 한 번에 다 보냈더라도 회차가 분리됨
            </td>
          </tr>
        </tbody>
      </table>
      <p className="mt-3 rounded-md border border-[var(--jm-warning-border)] bg-[var(--jm-warning-bg)] p-3 text-jm-xs text-[var(--jm-warning-fg)]">
        💡 <strong>왜 둘 다 "분할" 로 묶었나?</strong> 손님 입장에선 두 케이스 모두
        "여러 박스가 따로 도착" 한 사실이 동일하고, 매장 입장에서도 "여러 번 송장
        발급" 운영 부담이 같습니다. 따라서 <strong>주문 단위로 몇 번 발송했는가</strong>{" "}
        를 단일 지표(<code>shipmentCount</code>) 로 추적합니다. 단일 회차(1회) 는
        일반 발송으로 간주하고 노이즈를 줄이려 표시 생략.
      </p>

      <h3 className="mt-5 text-jm-sm font-semibold">진행 중 표시 규칙</h3>
      <ul className="space-y-1.5 text-jm-sm">
        <li>
          <strong>출고 진행</strong> (info, 파랑) — 출고대기/출고확정/배송중에서 일부만
          발송된 경우. <code className="rounded bg-[var(--jm-surface-muted)] px-1 py-0.5">발송 N/M</code>{" "}
          (M = 카트 내 모든 품목 quantity 합계)
        </li>
        <li>
          <strong>반품 진행</strong> (warning, 노랑) — 배송완료에서 일부 품목만 반품
          진행 중. <code className="rounded bg-[var(--jm-surface-muted)] px-1 py-0.5">반품 N/M</code>
        </li>
        <li>
          <strong>부분 종결</strong> (muted, 회색) — 반품완료/교환완료지만 일부만 처리되고
          잔량은 정상 종결된 경우. 운영 메모용 표시
        </li>
      </ul>

      <h3 className="mt-5 text-jm-sm font-semibold">워크보드 행 단위 = 품목 (item)</h3>
      <p>
        같은 주문이라도 카트에 여러 품목이 있으면 <strong>품목마다 행이 분리</strong>되어
        표시됩니다 (네이버 스마트스토어·쿠팡 WING 패턴). 같은 주문번호가 그룹화되어 첫
        행에만 주문번호·고객·채널·결제 등 주문 단위 정보가 표시되고, 나머지 행은 좌측
        세로 라인으로 그룹임을 표시합니다.
      </p>
      <ul className="mt-2 space-y-1.5 text-jm-sm">
        <li>
          행 클릭 시 상세 시트가 열리며 클릭한 <strong>품목이 자동 강조 + 해당 위치로
          스크롤</strong>됩니다
        </li>
        <li>
          진행률 progress bar 는 이제 <strong>라인별</strong> (이 품목 내 quantity vs
          shippedQty/returnedQty) — 같은 주문이라도 라인마다 다른 진행률 표시
        </li>
        <li>
          상태 배지는 라인 단위 라벨 — 예: PREPARING 주문에서 A 라인 100% 발송 → "발송완료"
          (success), B 라인 0% → "발송대기" (info)
        </li>
        <li>
          분할 N회 칩 / 다음 액션 버튼은 order 단위 정보이므로 <strong>그룹 첫 행</strong>에만 표시
        </li>
        <li>
          <strong>KPI 숫자 / 그룹 카운트는 주문 단위 유지</strong> — 행이 늘어났다고
          카운트가 부풀지 않음
        </li>
      </ul>

      <h3 className="mt-5 text-jm-sm font-semibold">상세 시트에서의 부분 처리</h3>
      <p>
        상세 시트(행 클릭) 의 항목 카드에서{" "}
        <strong>라인별 진행 상황</strong>을 확인하고, [부분 발송] / [부분 반품] /
        [부분 교환] dialog 로 라인마다 처리할 수량을 입력합니다.
      </p>

      <h3 className="mt-5 text-jm-sm font-semibold">
        분할 송장 — 회차별 송장번호 보관
      </h3>
      <p>
        한 주문이 <strong>여러 박스로 따로 발송</strong>될 때 (재고 입고 대기로 일부만
        먼저 보낼 때, 다른 창고에서 발송할 때 등) 회차마다 다른 송장번호를 보관합니다.
        한국 오픈마켓 (네이버·쿠팡·11번가·G마켓) 모두 같은 패턴.
      </p>
      <ul className="mt-2 space-y-1.5 text-jm-sm">
        <li>
          [발송] 또는 [부분 발송] 액션 시 <strong>1차·2차·3차 회차 Shipment</strong> 가
          자동 생성됨
        </li>
        <li>
          각 회차마다 송장사·송장번호·발송시각·해당 라인+수량 보관
        </li>
        <li>
          상세 시트의 <strong>"발송 이력" 카드</strong>에 회차별로 노출 — 1차 송장이
          어떤 라인을 보냈는지, 2차는 어떤 라인을 보냈는지 추적 가능
        </li>
        <li>
          외부 채널 자동 push 는 마지막(최신) 회차 송장 기준 (Phase 2 후 회차별 push 가능)
        </li>
      </ul>
    </Section>
  );
}

// ─────────── 4. 옵션 도메인

function SectionOptions() {
  return (
    <Section id="options" title="4. 옵션 도메인 — SWAP / ADDON / OPTION_PARENT">
      <p>
        고객이 직접 선택하는 옵션 (색상·용량·필터 등) 은{" "}
        <strong>변형상품(매장 조립 분기) 과 별도 도메인</strong>으로 모델링됩니다.
      </p>

      <h3 className="mt-4 text-jm-sm font-semibold">옵션값 처리 모드 (mappedMode)</h3>
      <p className="text-jm-xs text-[var(--jm-text-muted)]">
        ProductOptionValue 가 다른 Product 를 매핑할 때 결제 라인에 어떻게 반영할지 결정.
      </p>
      <ul className="mt-2 space-y-2 text-jm-sm">
        <li>
          <strong>SWAP</strong> (
          <code className="rounded bg-[var(--jm-surface-muted)] px-1 py-0.5">mappedMode=SWAP</code>
          ) — 메인 라인의 productId 를 매핑된 SKU 로 교체. 색상·사이즈 변형 같은 케이스. 예:
          대표 "가습기" + 색상=블랙 → 메인 라인이 가습기-블랙 SKU 로 swap. 매장은 색상별
          별도 SKU (재고/입고/시리얼 분리) 등록.
        </li>
        <li>
          <strong>ADDON</strong> (
          <code className="rounded bg-[var(--jm-surface-muted)] px-1 py-0.5">mappedMode=ADDON</code>
          ) — 옵션 선택 시 자식 OrderItem 자동 추가 (메인 + 부속). 본 상품 내부 부속이 별도
          SKU 인 드문 케이스. 일반적인 추가구매 추천은 BundleProduct 도메인을 쓰는 게
          권장 (아래 §4-3 참고).
        </li>
        <li>
          <strong>단순 텍스트</strong> (mappedProductId 없음) — 라벨만 보존. addPrice 가
          있으면 메인 unitPrice 에 가산.
        </li>
        <li>
          <strong>매장 variant 매핑</strong> (mappedVariantId, Phase 3) — 부속 변형 자동
          Assembly. 현재 미구현, 단순 텍스트와 동일 처리.
        </li>
      </ul>

      <h3 className="mt-5 text-jm-sm font-semibold">ProductType.OPTION_PARENT</h3>
      <p>
        자체 재고 없는 카탈로그 placeholder. 색상/사이즈 옵션의 SWAP 으로만 실제 SKU 가
        결정되는 운영을 위함. 등록 시 가격/재고/매핑 입력 비활성, 옵션 슬롯에 SWAP 옵션값
        들을 등록해서 손님이 선택하면 메인 라인이 그 SKU 로 swap. 결제 시 SWAP 옵션값
        선택 강제.
      </p>

      <h3 className="mt-5 text-jm-sm font-semibold">Product.catalogHidden</h3>
      <p>
        카탈로그 노출 차단 토글. 옵션 swap 의 대상 SKU 단독 노출을 막을 때 사용 (가습기-블랙
        은 단독 카탈로그 안 보이지만 가습기-화이트 / 대표 가습기의 옵션 SWAP 으로만 도달).
      </p>

      <h3 className="mt-5 text-jm-sm font-semibold">OrderItem 라인 역할</h3>
      <table className="mt-2 w-full table-fixed text-jm-sm">
        <thead>
          <tr className="border-b border-[var(--jm-border)] text-left text-jm-xs text-[var(--jm-text-muted)]">
            <th className="w-[120px] py-2">lineRole</th>
            <th className="py-2">의미</th>
          </tr>
        </thead>
        <tbody className="text-jm-xs">
          <tr className="border-b border-[var(--jm-border-subtle)]">
            <td className="py-2 font-mono">MAIN</td>
            <td className="py-2">기본 라인. SWAP 결과 swap 된 SKU 도 여기. optionSnapshot 으로 옵션값 보존</td>
          </tr>
          <tr className="border-b border-[var(--jm-border-subtle)]">
            <td className="py-2 font-mono">OPTION_REF</td>
            <td className="py-2">옵션값의 mappedMode=ADDON 분기 — 자식 OrderItem. parentItemId 가 메인 가리킴</td>
          </tr>
          <tr>
            <td className="py-2 font-mono">ADDON</td>
            <td className="py-2">BundleProduct 추천에서 손님이 선택한 추가구매 (별도 카탈로그 상품)</td>
          </tr>
        </tbody>
      </table>

      <h3 className="mt-5 text-jm-sm font-semibold">진입 경로 (entryProductId) — 자사몰 funnel</h3>
      <p>
        SWAP 으로 메인 라인 SKU 가 바뀐 후에도 손님이 진입한 카탈로그 SKU 를 보존하는 컬럼.
        예: 대표 "가습기" 페이지 → 색상=블랙 swap → OrderItem.productId=가습기-블랙,
        entryProductId=대표가습기. POS 결제는 직원 입력이라 항상 null (funnel 노이즈 회피).
      </p>
      <p className="mt-2">
        분석은 <code className="rounded bg-[var(--jm-surface-muted)] px-1 py-0.5">/reports/option-funnel</code>
        에서 진입 SKU × 결제 SKU 매트릭스 + SWAP 비율 집계.
      </p>

      <h3 className="mt-5 text-jm-sm font-semibold">워크보드 시각</h3>
      <ul className="space-y-1.5 text-jm-sm">
        <li>
          <strong>자식 라인</strong> — 들여쓰기 + prefix 라벨{" "}
          <code className="rounded bg-[var(--jm-surface-muted)] px-1 py-0.5">↳ 옵션</code> /
          <code className="rounded bg-[var(--jm-surface-muted)] px-1 py-0.5"> ↳ 추가구매</code>
        </li>
        <li>
          <strong>SWAP 발생</strong> — 상품명 옆 회색 chip{" "}
          <code className="rounded bg-[var(--jm-surface-muted)] px-1 py-0.5">← 진입: ○○○</code>
          (entryProductId ≠ productId)
        </li>
        <li>
          <strong>옵션값 부속</strong> — SWAP 안 일어났을 때만 "(화이트 · L)" 표시 (SWAP
          결과는 상품명에 이미 포함)
        </li>
      </ul>

      <h3 className="mt-5 text-jm-sm font-semibold">재고 정합성</h3>
      <p>
        SWAP 결과 productId 기준으로 inventory/lot/시리얼 발번/매출 집계 모두 정확.
        OPTION_PARENT 자체는 거래 흔적 안 남음 (placeholder). 색상별 매출 통계 가능
        (가습기-블랙 30개 / 가습기-화이트 50개).
      </p>
    </Section>
  );
}

// ─────────── 4-3. ADDON 도메인 (BundleProduct)

function SectionAddon() {
  return (
    <Section id="addon" title="4-3. ADDON 도메인 — 추가구매 추천 (BundleProduct)">
      <p>
        메인 상품과 함께 사면 좋은 <strong>별도 카탈로그 상품</strong> 을 추천 목록으로 등록.
        ProductOption 과 다른 도메인 — 손님이 명시적으로 선택해서 함께 구매.
      </p>

      <h3 className="mt-4 text-jm-sm font-semibold">옵션 vs 추가구매 차이</h3>
      <table className="mt-2 w-full table-fixed text-jm-sm">
        <thead>
          <tr className="border-b border-[var(--jm-border)] text-left text-jm-xs text-[var(--jm-text-muted)]">
            <th className="w-[140px] py-2"></th>
            <th className="py-2">ProductOption</th>
            <th className="py-2">BundleProduct</th>
          </tr>
        </thead>
        <tbody className="text-jm-xs">
          <tr className="border-b border-[var(--jm-border-subtle)]">
            <td className="py-2 font-medium">본질</td>
            <td className="py-2">메인 상품의 선택지 (필수 결정)</td>
            <td className="py-2">별도 카탈로그 상품 추천 (선택 결정)</td>
          </tr>
          <tr className="border-b border-[var(--jm-border-subtle)]">
            <td className="py-2 font-medium">단독 판매</td>
            <td className="py-2">의미 없음 (예: 색상만 따로 X)</td>
            <td className="py-2">단독으로도 카탈로그 노출 + 판매 가능</td>
          </tr>
          <tr>
            <td className="py-2 font-medium">예시</td>
            <td className="py-2">색상, 사이즈, 메모리 사양</td>
            <td className="py-2">필터, 케이스, 액세서리</td>
          </tr>
        </tbody>
      </table>

      <h3 className="mt-5 text-jm-sm font-semibold">흐름 (POS)</h3>
      <ol className="ml-4 list-decimal space-y-1 text-jm-sm">
        <li>메인 상품 카트 추가 (자동 모달 X)</li>
        <li>카트 시트에서 라인의 [+ 추가구매] 버튼 클릭</li>
        <li>추천 시트 → 손님이 추가 상품 선택 (수량/할인 표시)</li>
        <li>[추가] → 카트에 ADDON 자식 라인 (parentCartItemId=메인) 추가</li>
        <li>결제 시 OrderItem.lineRole=ADDON, parentItemId=메인 으로 생성</li>
        <li>메인 라인 삭제/취소 시 ADDON 자식 cascade</li>
      </ol>

      <h3 className="mt-5 text-jm-sm font-semibold">번들 할인</h3>
      <p>
        BundleProduct.discountAmount 로 메인과 함께 살 때 할인 적용. 예: 필터 정가 ₩12,000
        → 가습기 + 함께 사면 ₩11,000 (₩1,000 번들 할인).
      </p>
    </Section>
  );
}

// ─────────── 5. 반품 흐름

function SectionRefund() {
  return (
    <Section id="refund" title="5. 반품 흐름 (6단계)">
      <p>
        손님이 반품 요청 → 매장 결정 → 회수 (라벨 발급/도착) → 검수 → 종결. 색은{" "}
        <strong>노랑</strong> (warning) 톤으로 통일. 워크보드 외{" "}
        <strong>전용 batch 처리 페이지</strong>{" "}
        <code className="rounded bg-[var(--jm-surface)] px-1 py-0.5">
          /orders/claims
        </code>{" "}
        에서 단계별 그룹 KPI + 액션 inline 으로 빠르게 처리 가능.
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
        what="매장 수락. 택배 회수 라벨 발급 또는 매장 직접 회수 분기 결정 단계."
        actions={[
          { who: "매장", what: "[회수 시작] — 택배 회수 라벨 발급 후 운송 시작" },
          { who: "매장", what: "[회수완료] — 매장 직접 회수해 즉시 검수로" },
          {
            who: "자동",
            what: "외부 채널이면 채널 시스템에 acceptReturn 자동 통보",
          },
        ]}
      />
      <StepRow
        no={3}
        badge={
          <StatusBadge status="RETURN_PICKING" claimType={REFUND_CTX} />
        }
        title="반품 회수중"
        what="택배 회수 라벨 발급됨. 손님 → 매장 운송 중. 매장 직접 회수 케이스에서는 이 단계 생략."
        actions={[{ who: "매장", what: "물품 도착 시 [회수완료]" }]}
      />
      <StepRow
        no={4}
        badge={
          <StatusBadge status="RETURN_COLLECTED" claimType={REFUND_CTX} />
        }
        title="회수완료"
        what="물품 매장 도착. 검수 대기."
        actions={[
          { who: "매장", what: "포장 상태·기능·외관 검수 후 [검수완료]" },
          { who: "매장", what: "[검수 반려] — 불량 발견 시 손님 반송, COMPLETED 복귀" },
        ]}
      />
      <StepRow
        no={5}
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
        no={6}
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
    <Section id="exchange" title="6. 교환 흐름 + 새 주문 (5단계 + 새 출고)">
      <p>
        반품 흐름과 단계는 같지만 종결이 다릅니다 — 환불 대신 <strong>새 주문 자동 생성</strong>.
        색은 <strong>보라</strong> (accent) 톤으로 통일되어 반품과 시각 분리.
      </p>

      <div className="mt-3 rounded-md border border-[var(--jm-accent-bg)] bg-[var(--jm-accent-bg)] p-3 text-jm-xs text-[var(--jm-accent-fg)]">
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
        <p className="mb-2 text-jm-xs font-medium text-[var(--jm-text-subtle)]">
          마진 리포트 정합성
        </p>
        <p className="text-jm-sm">
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
    <Section id="payment" title="7. 결제 상태 (paymentStatus)">
      <p>
        출고 축과 별개로 추적되는 <strong>결제 축</strong>. 외상 출고, 환불 진행,
        매출 취소 등을 표현.
      </p>

      <table className="mt-3 w-full text-jm-sm">
        <thead>
          <tr className="border-b border-[var(--jm-border)] text-left text-jm-xs text-[var(--jm-text-muted)]">
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
    <Section id="cancel" title="8. 취소 흐름">
      <p>
        취소는 <strong>출고대기까지만</strong> 가능합니다. 출고확정(송장 발급) 이후엔
        취소 대신 <strong>반품 흐름</strong>으로 처리해야 합니다.
      </p>

      <table className="mt-3 w-full text-jm-sm">
        <thead>
          <tr className="border-b border-[var(--jm-border)] text-left text-jm-xs text-[var(--jm-text-muted)]">
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

// ─────────── 9. 출고 보조 도구 — 변형 SKU·송장·운임 (2026-05-10 추가)

function SectionFulfillmentTools() {
  return (
    <Section
      id="fulfillment-tools"
      title="9. 출고 보조 도구 — 변형 SKU·송장·운임 정책"
    >
      <p>
        2026-05-10 추가된 출고·반품 운영 보조 기능들. 워크보드/상세 시트에서 자주
        보게 되는 요소들.
      </p>

      <h3 className="mt-4 text-jm-md font-semibold">변형/옵션 출고 SKU 선택</h3>
      <p>
        외부 채널이 <strong>대표상품(canonical)</strong> 또는{" "}
        <strong>OPTION_PARENT(옵션 placeholder)</strong> SKU 로 주문을 보내면, 매장이
        출고대기 진입 시 실제 출고할 변형/SWAP 옵션을 직접 선택해야 한다 (POS
        흐름과 동일).
      </p>
      <ul className="ml-5 list-disc space-y-1 text-jm-sm">
        <li>
          워크보드 행에 <strong>"변형 미확정"</strong> /{" "}
          <strong>"옵션 미확정"</strong> 노란 배지 — PENDING + canonical/OPTION_PARENT 일 때만 노출
        </li>
        <li>
          <strong>[출고대기]</strong> 클릭 시 가드 에러 → 자동으로 변형 선택 다이얼로그 오픈
          → 일괄 해결 → prepare 자동 재시도
        </li>
        <li>
          상세 시트에서도 라인 옆 <strong>[출고 SKU 선택]</strong> 버튼으로 단건 처리
          가능 (PENDING 한정)
        </li>
        <li>
          API 가드: <code className="rounded bg-[var(--jm-surface)] px-1 py-0.5">
            isCanonical || productType === "OPTION_PARENT"
          </code>{" "}
          모두 차단. 응답에 <code className="rounded bg-[var(--jm-surface)] px-1 py-0.5">
            unresolvedItemIds
          </code>{" "}
          포함
        </li>
      </ul>

      <h3 className="mt-5 text-jm-md font-semibold">반품 처리 전용 뷰 — /orders/claims</h3>
      <p>
        워크보드는 출고+반품을 모두 다루므로 클레임 batch 처리 시 어수선함. 4
        단계 (요청 접수 / 회수 대기 / 회수 중 / 회수 완료 / 검수 완료) 별 KPI +
        액션 inline 으로 빠르게 처리.
      </p>
      <ul className="ml-5 list-disc space-y-1 text-jm-sm">
        <li>RETURN_REQUESTED → 수락 / 반려</li>
        <li>RETURN_ACCEPTED → 회수 시작 / 회수완료</li>
        <li>RETURN_PICKING → 회수완료</li>
        <li>RETURN_COLLECTED → 검수완료</li>
        <li>RETURN_INSPECTED → 반품완료 / 교환완료</li>
      </ul>

      <h3 className="mt-5 text-jm-md font-semibold">송장 사전 등록</h3>
      <p>
        PREPARING 단계에서 미리 송장 정보 입력 → 출고확정(ship) 시 자동 prefill.
        포장하면서 외부 시스템에서 발급한 송장번호를 즉시 ERP 에 저장해두면 발송
        클릭 시 따로 다시 입력 안 해도 됨.
      </p>

      <h3 className="mt-5 text-jm-md font-semibold">운임 자동 정책 (교환 -EX)</h3>
      <p>
        교환 -EX 새 주문 생성 시{" "}
        <code className="rounded bg-[var(--jm-surface)] px-1 py-0.5">
          claimReason
        </code>{" "}
        의 책임 매핑 (shop / customer / shared) 기반으로{" "}
        <strong>shippingPaymentType</strong> 자동 설정 + memo 안내 부여.
      </p>
      <ul className="ml-5 list-disc space-y-1 text-jm-sm">
        <li>
          shop (DEFECTIVE/DAMAGED_IN_TRANSIT/WRONG_ITEM) → STORE_BURDEN 자동
        </li>
        <li>customer (CHANGE_MIND) → COD 자동 (착불)</li>
        <li>shared (SIZE_COLOR/OTHER) → PREPAID — 매장 직원이 직접 결정</li>
      </ul>

      <h3 className="mt-5 text-jm-md font-semibold">PARTIAL_REFUND 매출 계산</h3>
      <p>
        통합 판매내역 (<code className="rounded bg-[var(--jm-surface)] px-1 py-0.5">
          /sales/history
        </code>
        ) 의 부분 환불 처리 — 항목별{" "}
        <code className="rounded bg-[var(--jm-surface)] px-1 py-0.5">
          refundedAmount
        </code>{" "}
        합계로 순매출 자동 차감.{" "}
        <code className="rounded bg-[var(--jm-surface)] px-1 py-0.5">
          partialRefundAmount
        </code>{" "}
        필드가 row 응답에 포함되어 UI 가 strike + 차감 표시 가능.
      </p>

      <h3 className="mt-5 text-jm-md font-semibold">자동 알림 (Solapi)</h3>
      <p>
        환경변수 (<code className="rounded bg-[var(--jm-surface)] px-1 py-0.5">
          SOLAPI_API_KEY
        </code>{" "}
        등) 설정 시 SMS 자동 발송. 카카오 알림톡은{" "}
        <code className="rounded bg-[var(--jm-surface)] px-1 py-0.5">
          SOLAPI_KAKAO_TPL_*
        </code>{" "}
        템플릿 ID 환경변수로 활성화.
      </p>
      <ul className="ml-5 list-disc space-y-1 text-jm-sm">
        <li>complete (배송완료) → 손님 ORDER_DELIVERED</li>
        <li>accept_return / reject_return → 손님 통지</li>
        <li>exchange (전체+부분) → 차액 결제 안내 EXCHANGE_DIFFERENT_PAYMENT</li>
        <li>채널 보류 큐 임계값 초과 → 매장 ADMIN PENDING_QUEUE_THRESHOLD</li>
        <li>진단 대기 N일 (cron noshow-policy) → ADMIN 이메일</li>
      </ul>
    </Section>
  );
}

// ─────────── 10. 자주 헷갈리는 포인트

function SectionPitfalls() {
  return (
    <Section id="pitfalls" title="10. 자주 헷갈리는 포인트">
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
        <JmCardContent className="space-y-2 text-jm-sm text-[var(--jm-text)]">
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
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--jm-surface-muted)] text-jm-xs font-semibold text-[var(--jm-text-muted)]">
          {no}
        </span>
        {badge}
        <span className="text-jm-base font-medium">{title}</span>
      </div>
      <p className="mt-2 text-jm-sm text-[var(--jm-text)]">{what}</p>
      {actions && actions.length > 0 && (
        <div className="mt-2">
          <p className="text-jm-2xs font-medium text-[var(--jm-text-subtle)]">
            액션
          </p>
          <ul className="mt-1 space-y-0.5 text-jm-xs">
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
        <div className="mt-2 rounded border border-[var(--jm-border-subtle)] bg-[var(--jm-surface-muted)] p-2 text-jm-xs text-[var(--jm-text-muted)]">
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
      <p className="text-jm-sm font-medium">{title}</p>
      <p className="mt-1 text-jm-xs text-[var(--jm-text-muted)]">{children}</p>
    </div>
  );
}
