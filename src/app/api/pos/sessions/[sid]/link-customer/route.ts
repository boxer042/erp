import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";

/**
 * 미등록 손님 세션에 등록 고객을 연결할 때 — 그 세션의 모든 미등록 RepairTicket 을 같은 고객으로 일괄 매핑.
 * 호출 시점:
 *   - customer page 의 LinkCustomerSheet / QuickCustomerSheet 에서 손님 선택/등록 직후
 *
 * 효과:
 *   - 그 세션의 RepairTicket(posSessionId=sid, customerId=null) → customerId=:customerId
 *   - useRepairSync 가 customerId 기준으로 fetch 해도 ticket 들이 그대로 따라옴 (사라지지 않음)
 */
const bodySchema = z.object({
  customerId: z.string().min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sid: string }> },
) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { sid } = await params;
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { customerId } = parsed.data;

  const result = await prisma.repairTicket.updateMany({
    where: {
      posSessionId: sid,
      customerId: null,
    },
    data: { customerId },
  });

  return NextResponse.json({ relinked: result.count });
}
