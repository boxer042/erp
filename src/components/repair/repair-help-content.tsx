"use client";

import { ArrowLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { JmBadge, JmCard, JmCardContent, JmCardHeader, JmCardTitle } from "@/jm";

/**
 * 수리 시스템 가이드 — POS(`/pos/repairs/help`) · 어드민(`/repairs/help`) 양쪽 라우트가 공유.
 * backHref 만 다르고 본문은 동일. 매장 직원이 거절/취소/픽업 판단을 한 곳에서 이해하도록 정리.
 */
export function RepairHelpContent({
  backHref,
  backLabel,
}: {
  backHref: string;
  backLabel: string;
}) {
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[var(--jm-bg)]">
      <div className="border-b border-[var(--jm-border)] bg-[var(--jm-surface)] px-5 py-3">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-jm-xs text-[var(--jm-text-muted)] hover:text-[var(--jm-text)]"
        >
          <ArrowLeft className="size-3.5" />
          {backLabel}
        </Link>
        <h1 className="mt-1 text-jm-xl font-semibold text-[var(--jm-text)]">
          수리 시스템 가이드
        </h1>
        <p className="mt-0.5 text-jm-xs text-[var(--jm-text-muted)]">
          수리 접수부터 종료(완료·거절·취소)까지의 모든 흐름과, 부속·공임·진단비
          청구 정책을 한 곳에서 확인하는 페이지입니다.
        </p>
      </div>

      <div className="mx-auto w-full max-w-4xl space-y-6 p-5">
        <Toc />
        <SectionOverview />
        <SectionNormalFlow />
        <SectionReject />
        <SectionEndCases />
        <SectionRejectVsCancel />
        <SectionPartsPolicy />
        <SectionPitfalls />
      </div>
    </div>
  );
}

// ─────────── 목차

function Toc() {
  const items = [
    { href: "#overview", label: "1. 개요 — 수리 타입 + 상태 전이" },
    { href: "#normal", label: "2. 정상 흐름 (접수 → 픽업)" },
    { href: "#reject", label: "3. 진단비만 청구 (거절)" },
    { href: "#endcases", label: "4. 3가지 종료 케이스 비교" },
    { href: "#reject-vs-cancel", label: "5. 거절 vs 취소 — 무엇을 쓰나" },
    { href: "#parts", label: "6. 부속 · 공임 · 진단비 정책" },
    { href: "#pitfalls", label: "7. 자주 헷갈리는 포인트" },
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
                className="inline-flex items-center gap-1 text-[var(--jm-text)] underline-offset-2 hover:text-[var(--jm-action)] hover:underline"
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
    <Section id="overview" title="1. 개요 — 수리 타입 + 상태 전이">
      <p>
        수리 티켓은 <strong>두 가지 타입</strong>으로 나뉘고, 타입에 따라 거치는
        단계가 다릅니다.
      </p>
      <table className="mt-3 w-full text-jm-sm">
        <thead>
          <tr className="border-b border-[var(--jm-border)] text-left text-jm-xs text-[var(--jm-text-muted)]">
            <th className="w-[110px] py-2">타입</th>
            <th className="py-2">의미 / 흐름</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-[var(--jm-border-subtle)]">
            <td className="py-2 align-top font-medium">ON_SITE (즉시)</td>
            <td className="py-2">
              손님이 매장에서 대기. 새수리 드로워의 [즉시 수리시작] 누르면 바로{" "}
              <strong>수리중(REPAIRING)</strong> 으로 진입 — 진단/견적 단계를
              건너뜀.
            </td>
          </tr>
          <tr>
            <td className="py-2 align-top font-medium">DROP_OFF (맡김)</td>
            <td className="py-2">
              손님이 기기를 맡기고 감. 접수 → 진단 → 견적 → 손님 승인 → 수리 의
              정식 흐름. 견적 단계에서 손님이 원격으로 승인할 수도 있음.
            </td>
          </tr>
        </tbody>
      </table>

      <p className="mt-4">전체 상태 전이:</p>
      <pre className="mt-2 overflow-x-auto rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface)] p-3 text-jm-xs text-[var(--jm-text)]">
{`RECEIVED → DIAGNOSING → QUOTED → APPROVED → REPAIRING → READY → PICKED_UP
 (접수)     (진단중)     (견적     (손님       (수리중)    (픽업    (인계
                        대기)    승인)                   대기)    완료)

         ↓ 어디서든                  ↓ 진단비만 청구 (거절)
       CANCELLED                    READY → PICKED_UP`}
      </pre>
    </Section>
  );
}

// ─────────── 2. 정상 흐름

function SectionNormalFlow() {
  const steps = [
    { badge: "접수", k: "RECEIVED", d: "수리 티켓 생성. DROP_OFF 는 여기서 대기, ON_SITE 는 바로 수리중으로." },
    { badge: "진단중", k: "DIAGNOSING", d: "직원이 기기를 살펴보고 증상·진단 입력. DROP_OFF 만 거침." },
    { badge: "견적대기", k: "QUOTED", d: "부속·공임 등록 후 견적 확정. 손님에게 금액 전달 (현장 또는 원격 승인 링크)." },
    { badge: "승인", k: "APPROVED", d: "손님이 견적을 승인. 작업 착수 준비." },
    { badge: "수리중", k: "REPAIRING", d: "실제 수리 작업. 부속·공임을 추가하며 진행." },
    { badge: "픽업대기", k: "READY", d: "작업 종료. 손님이 찾으러 오면 인계·결제만 남음." },
    { badge: "인계완료", k: "PICKED_UP", d: "픽업/결제 완료. 매출 확정 + 보증 시작." },
  ];
  return (
    <Section id="normal" title="2. 정상 흐름 (접수 → 픽업)">
      <p>
        하단 액션 버튼은 <strong>다음 단계로 진행</strong>하는 버튼만 보입니다.
        거절·취소 같은 종료 액션은 헤더 좌측 칩 메뉴 또는 별도 버튼에서 처리.
      </p>
      <div className="mt-3 space-y-2">
        {steps.map((s, i) => (
          <div
            key={s.k}
            className="flex items-start gap-3 rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface)] p-3"
          >
            <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--jm-surface-muted)] text-jm-xs font-semibold text-[var(--jm-text-muted)]">
              {i + 1}
            </span>
            <div className="min-w-0">
              <JmBadge variant="default" size="sm">
                {s.badge}
              </JmBadge>
              <p className="mt-1 text-jm-sm text-[var(--jm-text)]">{s.d}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-jm-xs text-[var(--jm-text-muted)]">
        ON_SITE 는 접수 → <strong>수리중</strong> 으로 직진하므로 진단중·견적대기·승인
        단계가 화면에 안 나타날 수 있습니다.
      </p>
    </Section>
  );
}

// ─────────── 3. 진단비만 청구 (거절)

function SectionReject() {
  return (
    <Section id="reject" title="3. 진단비만 청구 (거절)">
      <p>
        손님이 수리를 포기하거나 매장이 부속을 못 구해 진행 못 할 때 —{" "}
        <strong>진단까지 한 작업값(진단비)은 청구</strong>하고 마무리하는 흐름입니다.
      </p>

      <div className="mt-3 rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface)] p-3">
        <p className="text-jm-sm font-medium text-[var(--jm-text)]">동작</p>
        <ul className="mt-1.5 space-y-1 text-jm-sm">
          <li>
            • 하단 푸터의 <strong>[진단비만]</strong> 버튼 (좌측, 기존 진행 버튼과
            나란히) 클릭
          </li>
          <li>
            • 거절 사유 선택 시트가 열림 → 사유 선택 + 메모 → [진단비 청구로 진행]
          </li>
          <li>
            • 티켓이 <strong>인계대기(READY)</strong> 로 직행 → [픽업/결제] 에서{" "}
            <strong>진단비만</strong> 청구
          </li>
        </ul>
      </div>

      <p className="mt-4 text-jm-sm font-medium text-[var(--jm-text)]">
        어느 단계에서 가능한가
      </p>
      <table className="mt-1.5 w-full text-jm-sm">
        <tbody>
          <tr className="border-b border-[var(--jm-border-subtle)]">
            <td className="w-[140px] py-2 align-top font-medium">맡김 (DROP_OFF)</td>
            <td className="py-2">진단중 · 견적대기 단계</td>
          </tr>
          <tr>
            <td className="py-2 align-top font-medium">즉시 (ON_SITE)</td>
            <td className="py-2">
              수리중 단계 (즉시 수리는 바로 수리중으로 진입하므로)
            </td>
          </tr>
        </tbody>
      </table>

      <p className="mt-4 text-jm-sm font-medium text-[var(--jm-text)]">거절 사유</p>
      <p className="mt-1 text-jm-sm">
        손님 사유와 매장 사유 모두 입력 가능 — 어드민 수리 통계의 &ldquo;견적 거절
        분석&rdquo; 카드에서 거절률·사유 분포·평균 견적가로 집계됩니다.
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div className="rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface)] p-3">
          <span className="text-jm-2xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
            손님 사유
          </span>
          <ul className="mt-1 space-y-0.5 text-jm-sm">
            <li>• 가격 부담</li>
            <li>• 가성비 문제 (새 제품이 나음)</li>
            <li>• 다른 매장 비교</li>
            <li>• 단순 변심</li>
          </ul>
        </div>
        <div className="rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface)] p-3">
          <span className="text-jm-2xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
            매장 사유
          </span>
          <ul className="mt-1 space-y-0.5 text-jm-sm">
            <li>• 부속 수급 불가</li>
            <li>• 매장 포기 (장비·시간·복잡도)</li>
          </ul>
        </div>
      </div>

      <div className="mt-4 rounded-md border-2 border-[var(--jm-warning-bg)] bg-[var(--jm-warning-bg)] p-3 text-jm-sm text-[var(--jm-warning-fg)]">
        <strong>⚠ 부속·공임이 등록돼 있으면 [진단비만] 이 막힙니다.</strong>{" "}
        이미 작업이 일어난 케이스라 진단비만 청구하면 안 됨 — 4번 비교표 참고.
      </div>
    </Section>
  );
}

// ─────────── 4. 3가지 종료 케이스

function SectionEndCases() {
  return (
    <Section id="endcases" title="4. 3가지 종료 케이스 비교">
      <p>
        수리가 끝나는 방식은 <strong>작업을 얼마나 했는지</strong>로 갈립니다. 제일
        헷갈리는 부분이니 표로 정리:
      </p>
      <table className="mt-3 w-full text-jm-sm">
        <thead>
          <tr className="border-b border-[var(--jm-border)] text-left text-jm-xs text-[var(--jm-text-muted)]">
            <th className="w-[130px] py-2">케이스</th>
            <th className="w-[150px] py-2">청구</th>
            <th className="py-2">처리 방법</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-[var(--jm-border-subtle)]">
            <td className="py-2 align-top font-medium">
              ① 진단만 하고 작업 0 — 손님 거부
            </td>
            <td className="py-2 align-top">진단비만</td>
            <td className="py-2">
              <strong>[진단비만]</strong> 버튼 → 사유 입력 → 픽업
            </td>
          </tr>
          <tr className="border-b border-[var(--jm-border-subtle)]">
            <td className="py-2 align-top font-medium">
              ② 부분 작업 후 손님 거부
            </td>
            <td className="py-2 align-top">사용 부속 + 수행 공임</td>
            <td className="py-2">
              부속·공임을 <strong>실제 한 만큼</strong>으로 정리 →{" "}
              <strong>[수리 완료]</strong> → 픽업
            </td>
          </tr>
          <tr>
            <td className="py-2 align-top font-medium">③ 전액 수리 완료</td>
            <td className="py-2 align-top">부속 + 공임 전액</td>
            <td className="py-2">
              <strong>[수리 완료]</strong> → 픽업
            </td>
          </tr>
        </tbody>
      </table>

      <div className="mt-4 rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface)] p-3 text-jm-sm">
        <p className="font-medium text-[var(--jm-text)]">
          왜 ② 는 [진단비만] 이 아니라 [수리 완료] 인가?
        </p>
        <p className="mt-1 text-[var(--jm-text-muted)]">
          진단을 넘어 <strong>실제 작업(분해·부속 장착 등)</strong>이 일어났으면
          그건 &ldquo;수리 작업&rdquo;이고, 수리 작업은 공임으로 청구합니다.
          진단비는 <strong>작업이 0건일 때만</strong> 청구하는 바닥 요금 — 작업을
          했는데 진단비로 청구하면 매장이 한 일을 과소청구하게 됩니다. 그래서
          시스템도 부속·공임이 있으면 [진단비만] 을 막습니다.
        </p>
        <p className="mt-2 text-[var(--jm-text-muted)]">
          부분 작업이라 공임을 깎아주고 싶으면 — 공임 라인의 금액을 직접 낮춰
          입력하면 됩니다 (할인이지, 청구 기준이 진단비로 바뀌는 게 아님).
        </p>
      </div>
    </Section>
  );
}

// ─────────── 5. 거절 vs 취소

function SectionRejectVsCancel() {
  return (
    <Section id="reject-vs-cancel" title="5. 거절 vs 취소 — 무엇을 쓰나">
      <p>
        둘 다 &ldquo;수리를 안 한다&rdquo;는 점은 같지만,{" "}
        <strong>진단비를 청구하느냐</strong>가 갈립니다.
      </p>
      <table className="mt-3 w-full text-jm-sm">
        <thead>
          <tr className="border-b border-[var(--jm-border)] text-left text-jm-xs text-[var(--jm-text-muted)]">
            <th className="w-[110px] py-2"></th>
            <th className="py-2">진단비만 청구 (거절)</th>
            <th className="py-2">수리 취소</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-[var(--jm-border-subtle)]">
            <td className="py-2 font-medium">결과 상태</td>
            <td className="py-2">READY → PICKED_UP</td>
            <td className="py-2">CANCELLED</td>
          </tr>
          <tr className="border-b border-[var(--jm-border-subtle)]">
            <td className="py-2 font-medium">결제 흐름</td>
            <td className="py-2">있음 — 진단비 청구</td>
            <td className="py-2">없음 — 청구 0</td>
          </tr>
          <tr className="border-b border-[var(--jm-border-subtle)]">
            <td className="py-2 font-medium">부속 처리</td>
            <td className="py-2">부속 없을 때만 가능</td>
            <td className="py-2">USED 재고 복원 · LOST 손실 기록</td>
          </tr>
          <tr>
            <td className="py-2 font-medium">언제 쓰나</td>
            <td className="py-2">진단값은 받고 보낼 때</td>
            <td className="py-2">매장이 손실을 떠안고 그냥 보낼 때</td>
          </tr>
        </tbody>
      </table>

      <p className="mt-3 text-jm-sm font-medium text-[var(--jm-text)]">
        판단 기준: &ldquo;이 손실, 손님한테 받나 매장이 먹나?&rdquo;
      </p>
      <ul className="mt-1 space-y-1 text-jm-sm">
        <li>
          • 진단비라도 받겠다 → <strong>[진단비만]</strong> (거절)
        </li>
        <li>
          • 진단비도 면제하고 그냥 보내준다 → <strong>수리 취소</strong> (헤더 칩
          메뉴 → 수리 취소 → 사유 &ldquo;손님 거절&rdquo; 등)
        </li>
        <li>
          • 작업 도중 포기인데 부속이 못 쓰게 됐다 → 수리 취소 진입 전 부속을{" "}
          <strong>LOST</strong> 로 토글. 취소하면 LOST 부속은 손실로 기록됨 (회사
          부담은 &ldquo;손실&rdquo;, 손님 청구는 &ldquo;청구&rdquo; 토글)
        </li>
      </ul>
    </Section>
  );
}

// ─────────── 6. 부속 · 공임 · 진단비 정책

function SectionPartsPolicy() {
  return (
    <Section id="parts" title="6. 부속 · 공임 · 진단비 정책">
      <p className="text-jm-sm font-medium text-[var(--jm-text)]">
        부속 — USED / LOST
      </p>
      <ul className="mt-1 space-y-1 text-jm-sm">
        <li>
          • <strong>USED</strong> — 정상 사용. 합계 포함, 손님 청구. 취소 시 재고
          복원.
        </li>
        <li>
          • <strong>LOST</strong> — 못 쓰게 된 부속 (작업 중 파손 등). 취소해도
          재고 복원 안 함 (이미 소비됨).
        </li>
        <li>
          • LOST 일 때 추가로 <strong>청구 / 손실</strong> 토글(billLost):{" "}
          <em>청구</em> = 손님 부담 (합계 포함), <em>손실</em> = 회사 부담 (합계
          제외).
        </li>
      </ul>

      <p className="mt-4 text-jm-sm font-medium text-[var(--jm-text)]">
        진단비 — 작업하면 자동 면제
      </p>
      <p className="mt-1 text-jm-sm">
        진단비는 <strong>부속·공임이 0건일 때만</strong> 청구됩니다. 부속이나
        공임이 하나라도 있으면 진단비는 자동 면제(수리비에 흡수) — 하단 합계에서
        회색 취소선으로 표시됩니다. 진단비 이중청구를 막는 정책.
      </p>

      <p className="mt-4 text-jm-sm font-medium text-[var(--jm-text)]">
        금액 표시 — 부가세 포함
      </p>
      <p className="mt-1 text-jm-sm">
        화면의 모든 금액은 부가세 포함으로 표시됩니다. DB 저장값은 세전(공급가액)
        이고, 하단 푸터에서 공급가액 / 부가세 / 청구 합계 3줄로 분해해 보여줍니다.
      </p>
    </Section>
  );
}

// ─────────── 7. 자주 헷갈리는 포인트

function SectionPitfalls() {
  const items = [
    {
      q: "부분 작업 후 손님이 거부했는데 [진단비만] 이 안 눌려요",
      a: "정상입니다. 부속·공임이 있으면 [진단비만] 은 막힙니다. 부분 작업 케이스는 [수리 완료] → 픽업으로 처리하세요 (사용 부속 + 공임 청구). 4번 비교표 참고.",
    },
    {
      q: "[수리 완료] 는 손님이 원한 걸 다 고쳤을 때만 누르는 거 아닌가요?",
      a: "아닙니다. [수리 완료] 는 '이 티켓의 작업을 더 안 한다(종료)'는 뜻입니다. 부분 작업하다 멈춰도 그 시점이 종료점이니 [수리 완료] 가 맞습니다.",
    },
    {
      q: "거절했는데 통계에 안 잡혀요",
      a: "거절(진단비만 청구)은 quoteRejectReason 으로 기록되고 어드민 수리 통계의 '견적 거절 분석' 카드에 집계됩니다. 수리 취소(CANCELLED)는 '취소 사유 분포' 쪽에 잡힙니다 — 둘은 별개 집계.",
    },
    {
      q: "LOST 부속을 손님한테 청구하고 싶은데 취소하면 청구가 안 돼요",
      a: "수리 취소(CANCELLED)는 결제 흐름을 안 거칩니다. LOST 부속을 손님한테 청구하려면 취소가 아니라 [수리 완료] → 픽업으로 가야 합니다. LOST + '청구' 토글 후 픽업하면 합계에 포함됩니다.",
    },
    {
      q: "헤더의 즉시↔맡김 변경 / 수리 취소는 어디 있나요",
      a: "헤더 좌측의 상태/타입 칩(예: ● 수리중 즉시 ▾)을 누르면 메뉴가 열립니다. 거기서 즉시↔맡김 변경, 수리 취소를 처리합니다.",
    },
  ];
  return (
    <Section id="pitfalls" title="7. 자주 헷갈리는 포인트">
      <div className="space-y-3">
        {items.map((it, i) => (
          <div
            key={i}
            className="rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface)] p-3"
          >
            <p className="text-jm-sm font-medium text-[var(--jm-text)]">
              Q. {it.q}
            </p>
            <p className="mt-1 text-jm-sm text-[var(--jm-text-muted)]">{it.a}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ─────────── 공통 Section 래퍼

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
