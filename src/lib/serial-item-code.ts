import { Prisma } from "@prisma/client";

/**
 * 시리얼 라벨 코드 발번
 * 형식: YYMMDD-NNNN (예: 241125-0042)
 * 일별 4자리 시퀀스. 트랜잭션 내에서 prefix로 동일일자 코드 카운트 → +1 → insert.
 *
 * 사용 예:
 *   await prisma.$transaction(async (tx) => {
 *     for (const ... of N) {
 *       const code = await nextSerialItemCode(tx);
 *       await tx.serialItem.create({ data: { code, ... } });
 *     }
 *   });
 *
 * 같은 트랜잭션 안에서 N개 발번할 때: 매 호출마다 카운트 + 1을 해서 순차 발번. 동시성은
 * 외부에서 SERIALIZABLE 같은 격리 수준이 필요할 수 있으나, 일반 POS 사용 빈도에선 충돌 가능성 낮음.
 */
export async function nextSerialItemCode(
  tx: Prisma.TransactionClient,
  date: Date = new Date()
): Promise<string> {
  const yy = String(date.getFullYear() % 100).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const prefix = `${yy}${mm}${dd}`;

  const count = await tx.serialItem.count({
    where: { code: { startsWith: `${prefix}-` } },
  });

  const seq = String(count + 1).padStart(4, "0");
  return `${prefix}-${seq}`;
}
