"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { JmCard, JmBadge } from "@/jm";

/**
 * 회계 리포트 가이드 — 손익계산서·재무상태표·부가세 신고 자료의 의미와 사용법.
 * 각 리포트 페이지 헤더의 [도움말] 에서 진입.
 */
export default function ReportsHelpPage() {
  return (
    <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
      {/* 헤더 */}
      <div className="border-b border-[var(--jm-border)] bg-[var(--jm-surface)] px-5 py-3">
        <div className="flex items-center gap-2">
          <Link
            href="/reports/income-statement"
            className="inline-flex items-center gap-1 text-jm-xs text-[var(--jm-text-muted)] hover:text-[var(--jm-text)]"
          >
            <ArrowLeft className="size-3.5" />
            손익계산서로
          </Link>
        </div>
        <h1 className="mt-1 text-jm-xl font-semibold text-[var(--jm-text)]">
          회계 리포트 가이드
        </h1>
        <p className="mt-0.5 text-jm-xs text-[var(--jm-text-muted)]">
          손익계산서·재무상태표·부가세 신고 자료가 무엇인지, 어떻게 보고 입력하는지 정리한
          페이지입니다.
        </p>
      </div>

      <div className="mx-auto w-full max-w-4xl space-y-6 p-5">
        <Toc />
        <SectionVat />
        <SectionIncomeStatement />
        <SectionBalanceSheet />
        <SectionVatFiling />
        <SectionDeferred />
        <SectionFaq />
      </div>
    </div>
  );
}

// ─── 목차 ─────────────────────────────────────────────────────────────────

function Toc() {
  const items = [
    ["vat", "1. 부가세는 비용이 아니다"],
    ["income", "2. 손익계산서 보는 법"],
    ["balance", "3. 재무상태표 + 수기 항목 입력"],
    ["filing", "4. 부가세 신고 자료"],
    ["deferred", "5. 부가세 후납 (결제 종류)"],
    ["faq", "6. 자주 묻는 질문"],
  ];
  return (
    <JmCard>
      <div className="px-5 py-4">
        <div className="text-jm-sm font-semibold text-[var(--jm-text)]">목차</div>
        <div className="mt-2 flex flex-col gap-1">
          {items.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className="text-jm-sm text-[var(--jm-action)] underline-offset-2 hover:underline"
            >
              {label}
            </a>
          ))}
        </div>
      </div>
    </JmCard>
  );
}

// ─── 섹션 공통 ────────────────────────────────────────────────────────────

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
    <JmCard>
      <div
        id={id}
        className="scroll-mt-4 border-b border-[var(--jm-border)] px-5 py-3"
      >
        <h2 className="text-jm-base font-semibold text-[var(--jm-text)]">{title}</h2>
      </div>
      <div className="flex flex-col gap-3 px-5 py-4 text-jm-sm leading-relaxed text-[var(--jm-text)]">
        {children}
      </div>
    </JmCard>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[var(--jm-text)]">{children}</p>;
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-jm-xs text-[var(--jm-text-muted)]">{children}</p>;
}

function Bold({ children }: { children: React.ReactNode }) {
  return <span className="font-semibold text-[var(--jm-text)]">{children}</span>;
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--jm-info-bg)] bg-[var(--jm-info-bg)] px-3 py-2 text-jm-xs text-[var(--jm-info-fg)]">
      {children}
    </div>
  );
}

// ─── 1. 부가세 ────────────────────────────────────────────────────────────

function SectionVat() {
  return (
    <Section id="vat" title="1. 부가세는 비용이 아니다">
      <P>
        부가세는 <Bold>비용도 수익도 아닙니다.</Bold> 일반과세자에게는 잠시 맡아두는 돈이에요.
      </P>
      <ul className="ml-4 flex list-disc flex-col gap-1 text-[var(--jm-text)]">
        <li>
          <Bold>매입 시 낸 부가세</Bold> = 부가세대급금 (자산) — 나중에 국가로부터 돌려받음
        </li>
        <li>
          <Bold>매출 시 받은 부가세</Bold> = 부가세예수금 (부채) — 나중에 국가에 냄
        </li>
        <li>분기 신고 때 둘을 상계 → 차액만 납부 (또는 환급)</li>
      </ul>
      <InfoBox>
        그래서 <Bold>손익계산서·마진 분석은 모두 공급가액(세전) 기준</Bold>으로만 봅니다.
        부가세는 손익에 영향이 0이에요. 받은 만큼 돌려주는 돈이니까요.
      </InfoBox>
      <P>
        <Bold>부가세 납부도 비용이 아닙니다.</Bold> 받아둔 돈(예수금)을 국가에 넘기는 부채 상환일
        뿐이에요. 경비(`Expense`)에 절대 넣으면 안 됩니다 — 이중 차감됩니다.
      </P>
    </Section>
  );
}

// ─── 2. 손익계산서 ────────────────────────────────────────────────────────

function SectionIncomeStatement() {
  return (
    <Section id="income" title="2. 손익계산서 보는 법">
      <P>
        <Bold>기간 동안의 흐름</Bold>을 보는 표입니다. &quot;이번 달/분기에 얼마 벌었나&quot;.
      </P>
      <div className="rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] p-3 font-mono text-jm-xs text-[var(--jm-text)]">
        매출액 (총액)
        <br />
        &nbsp;&nbsp;− 매출 차감 (환불·교환·취소·부분환불)
        <br />
        = 순 매출액
        <br />
        &nbsp;&nbsp;− 매출원가 (FIFO 실제 원가)
        <br />
        = 매출총이익
        <br />
        &nbsp;&nbsp;− 판매관리비 (경비·수수료)
        <br />= 영업이익
      </div>
      <ul className="ml-4 flex list-disc flex-col gap-1">
        <li>
          매출은 <Bold>발생 시점</Bold>에 잡고, 환불·교환·취소는 별도{" "}
          <Bold>매출 차감</Bold> 라인으로 표시 (총액주의)
        </li>
        <li>부분환불은 수수료·판매비용·매출원가도 같은 비율로 비례 차감</li>
        <li>
          기간 토글 (이번 달/분기/올해) + 사용자 지정 + CSV 내보내기 + 12개월 추이 차트
        </li>
        <li>
          매출 차감 섹션의 <Bold>[상세보기]</Bold> 로 어느 주문이 환불됐는지 확인 가능
        </li>
      </ul>
      <Muted>
        영업이익률 = 영업이익 ÷ 순매출. 환불율 = 매출 차감 ÷ 총 매출액. 둘 다 KPI 카드에 표시됩니다.
      </Muted>
    </Section>
  );
}

// ─── 3. 재무상태표 ────────────────────────────────────────────────────────

function SectionBalanceSheet() {
  return (
    <Section id="balance" title="3. 재무상태표 + 수기 항목 입력">
      <P>
        <Bold>특정 시점의 잔량</Bold>을 보는 표입니다. &quot;지금 자산이 얼마, 부채가 얼마&quot;.
        손익계산서가 &quot;흐름&quot;이면 재무상태표는 &quot;스냅샷&quot;이에요.
      </P>
      <div className="flex flex-col gap-2">
        <div>
          <Bold>시스템이 자동 산출하는 항목</Bold>
          <ul className="ml-4 mt-1 flex list-disc flex-col gap-0.5 text-jm-xs">
            <li>자산: 매출채권(외상 미수), 재고자산(FIFO), 부가세대급금</li>
            <li>부채: 매입채무(거래처 미지급), 부가세예수금</li>
          </ul>
        </div>
        <div>
          <Bold>수기로 입력하는 항목</Bold> — 우측 상단 <JmBadge variant="default" size="sm">수기 항목</JmBadge> 버튼
          <ul className="ml-4 mt-1 flex list-disc flex-col gap-0.5 text-jm-xs">
            <li>자산: 현금·예금(통장 잔고), 비품·설비, 기타 자산</li>
            <li>부채: 차입금, 기타 부채</li>
            <li>자본: 자본금, 이익잉여금(전기 누적)</li>
          </ul>
        </div>
      </div>
      <InfoBox>
        <Bold>입력 방법</Bold>: [수기 항목] 버튼 → 분류 선택 → 항목명·금액 입력 → 추가.
        예: &quot;현금·예금&quot; 분류 + &quot;국민은행 보통예금&quot; + 30,000,000.
        입력하면 재무상태표가 즉시 갱신됩니다.
      </InfoBox>
      <P>
        <Bold>당기순이익(추정)</Bold> = 순자산 − 자본금 − 이익잉여금. 자본금·이익잉여금을 입력하면
        자본 구성에서 자동 계산되어 보입니다.
      </P>
      <Muted>
        부가세 대급금·예수금에 붙는 &quot;임시&quot; 배지 = 분기 신고 시 상계되어 0이 되는 정산
        대기 항목이라는 뜻. 다른 자산·부채(영업 잔량)와 성격이 달라 구분 표시합니다.
      </Muted>
    </Section>
  );
}

// ─── 4. 부가세 신고 자료 ──────────────────────────────────────────────────

function SectionVatFiling() {
  return (
    <Section id="filing" title="4. 부가세 신고 자료">
      <P>
        분기별 <Bold>매출·매입 부가세</Bold>를 정리한 페이지입니다. 세무사 전달용 / 홈택스 입력
        참고용.
      </P>
      <ul className="ml-4 flex list-disc flex-col gap-1">
        <li>
          <Bold>매출 부가세 (예수금)</Bold> — 활성 매출 − 환불·교환·취소·부분환불
        </li>
        <li>
          <Bold>매입 부가세 (대급금)</Bold> — 입고 + 입고비용 + 배송비 + 과세 경비 − 입고 반품
        </li>
        <li>
          <Bold>예상 납부액</Bold> = 예수금 − 대급금 (음수면 환급)
        </li>
        <li>거래처별 / 경비 카테고리별 분류 표 — 사업자번호 포함, CSV 다운로드</li>
      </ul>
      <Muted>
        사업자번호가 있는 고객 매출은 세금계산서 발행 대상으로 분리 표시됩니다.
      </Muted>
    </Section>
  );
}

// ─── 5. 부가세 후납 ───────────────────────────────────────────────────────

function SectionDeferred() {
  return (
    <Section id="deferred" title="5. 부가세 후납 (결제 종류)">
      <P>
        세금계산서 발행이 늦어져서 <Bold>공급가액만 먼저 결제하고 부가세는 나중에</Bold> 주고받는
        경우가 있습니다. 이를 추적하려면 결제·수금 등록 시 <Bold>종류</Bold>를 선택하세요.
      </P>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <JmBadge variant="default" size="sm">
            전체
          </JmBadge>
          <span className="text-jm-xs">공급가액 + 부가세 함께 결제 (일반적)</span>
        </div>
        <div className="flex items-center gap-2">
          <JmBadge variant="warning" size="sm">
            공급가액만
          </JmBadge>
          <span className="text-jm-xs">부가세 제외하고 공급가액만 — 부가세는 후납 예정</span>
        </div>
        <div className="flex items-center gap-2">
          <JmBadge variant="info" size="sm">
            부가세만
          </JmBadge>
          <span className="text-jm-xs">세금계산서 받은 후 부가세분만 별도 송금</span>
        </div>
      </div>
      <InfoBox>
        <Bold>예시</Bold>: 매입 110만원(공급가 100 + VAT 10) 청구 → 우선 100만원만 송금
        (종류=공급가액만) → 거래처 잔액에 10만원 남음 → 세금계산서 받고 10만원 별도 송금
        (종류=부가세만) → 잔액 0.
      </InfoBox>
      <P>
        결제 종류는 거래처 원장·고객 원장의 해당 행에 <Bold>배지</Bold>로 표시되고, 부가세 신고
        자료 페이지의 &quot;후납 결제 현황&quot; 에서 분기별로 집계됩니다.
      </P>
      <Muted>
        결제 종류는 잔액 계산에 영향을 주지 않습니다 (분류·추적용). 잔액은 종류와 무관하게 금액만큼
        차감됩니다.
      </Muted>
    </Section>
  );
}

// ─── 6. FAQ ──────────────────────────────────────────────────────────────

function SectionFaq() {
  const faqs: [string, React.ReactNode][] = [
    [
      "재고도 재무제표에 나오나요?",
      <>
        네. 재무상태표의 <Bold>재고자산</Bold>(시점 잔량)과 손익계산서의{" "}
        <Bold>매출원가</Bold>(판매되어 빠진 분) 양쪽에 나옵니다. 우리 시스템은 FIFO 실제 원가
        기준입니다.
      </>,
    ],
    [
      "통장 잔액과 손익이 왜 다른가요?",
      <>
        손익(공급가액 기준)은 &quot;내 돈&quot;, 통장 잔액(부가세 포함)은 &quot;실제 찍힌
        금액&quot;. 통장에는 곧 국가에 낼 부가세 예수금이 섞여 있어서, 그만큼 차이가 납니다.
        외상·카드 입금 지연도 시점 차이를 만들어요.
      </>,
    ],
    [
      "부가세 납부액은 어디에 기록하나요?",
      <>
        경비가 <Bold>아닙니다.</Bold> 부채 상환이라 손익에 안 들어가요. ERP 의 경비에 넣지 말고,
        통장에서 빠져나간 자금이동으로만 보세요. 신고·납부는 홈택스/세무사 영역입니다.
      </>,
    ],
    [
      "페이지가 뼈대만 보이거나 깨져요.",
      <>
        새로고침해도 그렇다면 데이터가 없는 기간일 수 있어요. 기간을 바꿔보세요. 빨간 에러 박스가
        뜨면 그 메시지를 확인하세요.
      </>,
    ],
  ];
  return (
    <Section id="faq" title="6. 자주 묻는 질문">
      <div className="flex flex-col gap-3">
        {faqs.map(([q, a], i) => (
          <div key={i}>
            <div className="font-semibold text-[var(--jm-text)]">Q. {q}</div>
            <div className="mt-0.5 text-[var(--jm-text-muted)]">{a}</div>
          </div>
        ))}
      </div>
    </Section>
  );
}
