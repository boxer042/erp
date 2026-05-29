import { Prisma } from "@prisma/client";

/**
 * UsedItem internalCode 발번
 * 형식: UU{YYMMDD}-NNNN (예: UU260529-0042)
 * 일별 4자리 시퀀스. 트랜잭션 내에서 prefix 로 동일일자 코드 카운트 → +1 → insert.
 *
 * 같은 트랜잭션 안에서 N개 발번할 때: 매 호출마다 카운트 + 1.
 * 동시성은 일반 매장 운영 빈도에선 충돌 가능성 낮음.
 */
export async function nextUsedItemCode(
  tx: Prisma.TransactionClient,
  date: Date = new Date(),
): Promise<string> {
  const yy = String(date.getFullYear() % 100).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const prefix = `UU${yy}${mm}${dd}`;

  const count = await tx.usedItem.count({
    where: { internalCode: { startsWith: `${prefix}-` } },
  });

  const seq = String(count + 1).padStart(4, "0");
  return `${prefix}-${seq}`;
}
