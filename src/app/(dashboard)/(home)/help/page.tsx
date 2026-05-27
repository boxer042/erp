import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import {
  JmCard,
  JmCardContent,
  JmCardHeader,
  JmCardTitle,
} from "@/jm";

/**
 * 대시보드 가이드 — 각 KPI 의 의미·계산식·기간 토글·권한을 설명.
 * 대시보드 헤더의 [도움말] 링크에서 진입.
 */
export default function DashboardHelpPage() {
  return (
    <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
      <div className="border-b border-[var(--jm-border)] bg-[var(--jm-surface)] px-5 py-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-jm-xs text-[var(--jm-text-muted)] hover:text-[var(--jm-text)]"
        >
          <ArrowLeft className="size-3.5" />
          대시보드로
        </Link>
        <h1 className="mt-1 text-jm-xl font-semibold text-[var(--jm-text)]">
          대시보드 가이드
        </h1>
        <p className="mt-0.5 text-jm-xs text-[var(--jm-text-muted)]">
          각 지표의 의미와 계산식, 기간 토글·권한 동작을 정리한 페이지입니다.
        </p>
      </div>

      <div className="mx-auto w-full max-w-4xl space-y-6 p-5">
        <HelpCard title="기간 토글">
          <p>
            헤더 우측의 <Term>오늘 / 이번 주 / 이번 달 / 지난 달 / 지정</Term> 토글로
            매출·이익 관련 지표의 집계 범위를 바꿉니다. <Term>지정</Term> 을 고르면
            달력에서 시작·종료일을 직접 선택할 수 있습니다.
          </p>
          <p>
            기간 토글의 영향을 받는 지표 — <Term>매출 / 매출총이익 / 영업이익 /
            객단가 / 반품률 / 재구매율 / 베스트셀러 / VIP 고객 / 채널·결제수단·카테고리
            차트 / 신규 고객</Term>. 그 외 <Term>재고·클레임·POS·수리·임대 대기</Term>{" "}
            같은 항목은 항상 <Term>현재 시점</Term> 기준입니다.
          </p>
        </HelpCard>

        <HelpCard title="경영 KPI (관리자 전용)">
          <Dl
            items={[
              [
                "매출",
                "정상 출고된 주문의 합계. 반품·매출취소·교환 발송 건은 제외하고, 부분 환불액은 차감합니다. (통합 판매내역의 순매출과 동일 정의)",
              ],
              [
                "매출총이익 / 마진율",
                "매출 − 매출원가. 원가는 실제 FIFO 로트 소진 기록을 우선 사용하고, 없으면 주문 시점 원가 스냅샷으로 계산합니다.",
              ],
              [
                "영업이익",
                "매출총이익 − 채널 수수료 − 일반 지출(Expense). 입고 운임은 매출원가에 이미 포함되어 있어 영업비용에서 중복 차감하지 않습니다. 거래처 차감 비용(recoverable)도 제외. 음수면 빨간색으로 표시됩니다.",
              ],
              [
                "재고 자산",
                "현재 남아있는 모든 재고 로트의 (잔량 × 매입원가) 합계. 회계 시점의 재고 가치입니다.",
              ],
            ]}
          />
        </HelpCard>

        <HelpCard title="운영 알람 KPI (전 직원)">
          <Dl
            items={[
              ["대기 주문", "접수만 되고 출고대기 전환이 안 된 주문 수."],
              [
                "클레임 대기",
                "반품 요청·검수 완료 대기 + 환불 진행 중(REFUND_PENDING) 주문 합계.",
              ],
              [
                "채널 이슈",
                "외부 채널 송장 전송 실패 + 변형 미해결로 보류된 채널 주문 합계.",
              ],
              ["재고 경고", "현재고가 안전재고 이하로 떨어진 활성 상품 수."],
              ["대기 입고", "확정 대기 중인 입고 전표 수."],
              ["POS 활성", "진행 중 + 장바구니 저장된 POS 상담 세션 수."],
              [
                "수리",
                "진행 중 수리 건수. 수령 대기(7일 경과 별도)·견적 응답 대기·평균 처리일을 보조 표시.",
              ],
              ["임대", "활성 + 연체 + 오늘 반환 예정 임대 건수."],
            ]}
          />
        </HelpCard>

        <HelpCard title="워크플로 대기 KPI">
          <Dl
            items={[
              ["발주 입고 대기", "확정·부분입고 상태로 잔량 입고를 기다리는 발주 수."],
              [
                "견적서 응답 대기",
                "발송(SENT) 상태 견적서 수. 3일 이내 만료 예정 건은 따로 표시.",
              ],
              ["신규 고객", "선택 기간에 새로 등록된 고객 수 (+ 최근 30일 활성 고객)."],
              [
                "30일+ 미수금",
                "가장 오래된 미상환 매출이 30일을 넘긴 고객 수. 회수가 시급한 대상.",
              ],
            ]}
          />
        </HelpCard>

        <HelpCard title="비즈니스·효율 지표 (관리자 전용)">
          <Dl
            items={[
              ["객단가 (AOV)", "기간 매출 ÷ 주문 수."],
              ["반품률", "기간 반품완료 ÷ (정상 매출 + 반품)."],
              ["재구매율", "지난 90일 동안 2회 이상 구매한 고객 ÷ 90일 활성 고객."],
              ["임대 가동률", "임대 중 자산 ÷ 운영 중인 전체 자산 (폐기 제외)."],
              ["재고 회전율", "기간 매출원가 ÷ 현재 재고 자산. 높을수록 재고가 빠르게 순환."],
              [
                "재고 소진일수 (DoI)",
                "현재 재고 자산 ÷ 일평균 매출원가. 지금 재고를 며칠 만에 소진하는지.",
              ],
              ["수리 공임 비중", "공임 금액 ÷ (공임 + 부속) 금액."],
              ["재수리율", "기간 접수 수리 중 재수리(이전 건의 후속) 비율."],
            ]}
          />
        </HelpCard>

        <HelpCard title="권한별 노출">
          <p>
            <Term>관리자(ADMIN)</Term> 는 매출·이익·자산·현금흐름·매출 차트 등 재무
            지표를 포함한 전체 대시보드를 봅니다.
          </p>
          <p>
            <Term>직원(STAFF)</Term> 에게는 재무 민감 정보가 숨겨지고, 운영 알람·워크플로
            대기·재고·최근 활동 등 업무 처리에 필요한 항목만 노출됩니다.
          </p>
        </HelpCard>
      </div>
    </div>
  );
}

function HelpCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <JmCard>
      <JmCardHeader>
        <JmCardTitle>{title}</JmCardTitle>
      </JmCardHeader>
      <JmCardContent className="space-y-2 text-jm-sm leading-relaxed text-[var(--jm-text-muted)]">
        {children}
      </JmCardContent>
    </JmCard>
  );
}

function Term({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-medium text-[var(--jm-text)]">{children}</span>
  );
}

function Dl({ items }: { items: [string, string][] }) {
  return (
    <dl className="divide-y divide-[var(--jm-border)]">
      {items.map(([term, desc]) => (
        <div key={term} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-4">
          <dt className="shrink-0 font-medium text-[var(--jm-text)] sm:w-40">
            {term}
          </dt>
          <dd className="flex-1">{desc}</dd>
        </div>
      ))}
    </dl>
  );
}
