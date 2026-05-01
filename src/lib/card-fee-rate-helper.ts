import type { Prisma } from "@prisma/client";

/**
 * 등록된 카드사들의 신용카드율 산술평균을 계산해 가장 최근 CardFeeRate row의 rate를 업데이트한다.
 * row가 없으면 오늘 날짜로 새로 생성. 이력은 자동으로 만들지 않는다 (= 덮어쓰기).
 * 카드사 0개면 아무 작업 안 함 (기존 적용값 유지).
 */
export async function recomputeCurrentCardFeeRate(
  tx: Prisma.TransactionClient,
): Promise<{ rate: number; count: number } | null> {
  const items = await tx.cardCompanyFee.findMany({
    where: { isActive: true },
    select: { creditRate: true },
  });
  if (items.length === 0) return null;

  const avg =
    items.reduce((acc, it) => acc + Number(it.creditRate), 0) / items.length;

  const latest = await tx.cardFeeRate.findFirst({
    orderBy: { appliedFrom: "desc" },
  });

  if (latest) {
    await tx.cardFeeRate.update({
      where: { id: latest.id },
      data: { rate: avg },
    });
  } else {
    await tx.cardFeeRate.create({
      data: { rate: avg, appliedFrom: new Date(), memo: "카드사별 평균 자동 적용" },
    });
  }

  return { rate: avg, count: items.length };
}
