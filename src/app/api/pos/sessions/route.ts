import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";

/**
 * POS 카트 세션 — user 별 격리. 디바이스간 공유.
 *
 * GET  /api/pos/sessions          — 현재 user 의 모든 활성 세션
 * POST /api/pos/sessions/sync     — 클라이언트 → 서버 일괄 sync
 *                                    (서버 → 클라이언트 merge 결과 반환)
 */

interface SessionPayload {
  id: string;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  label?: string;
  totalDiscount?: string;
  shippingCost?: string;
  items?: unknown[]; // CartItem[] — 클라이언트 타입과 동일
  quotationId?: string | null;
  quotationFingerprint?: string | null;
  labelCodes?: string[] | null;
  labelFingerprint?: string | null;
  repairTicketIds?: string[] | null;
  openRepairCount?: number | null;
  /** 클라이언트 측 마지막 변경 시각 — merge 시 비교용 */
  updatedAt?: string;
}

export async function GET() {
  const [user, deny] = await guardUser();
  if (deny) return deny;

  const rows = await prisma.posSession.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(rows.map(toClientShape));
}

function toClientShape(row: Awaited<ReturnType<typeof prisma.posSession.findFirst>>) {
  if (!row) return null;
  return {
    id: row.id,
    customerId: row.customerId,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    label: row.label,
    totalDiscount: row.totalDiscount,
    shippingCost: row.shippingCost,
    items: row.items,
    quotationId: row.quotationId,
    quotationFingerprint: row.quotationFingerprint,
    labelCodes: row.labelCodes,
    labelFingerprint: row.labelFingerprint,
    repairTicketIds: row.repairTicketIds,
    openRepairCount: row.openRepairCount,
    updatedAt: row.updatedAt.toISOString(),
  };
}

interface SyncBody {
  /** 클라이언트가 보유한 세션들 — 서버에 upsert */
  sessions: SessionPayload[];
  /** 클라이언트에서 명시 삭제된 세션 ID — 서버에서도 삭제 */
  deletedIds?: string[];
}

/**
 * 일괄 sync — last-write-wins(updatedAt 비교).
 * 클라이언트가 5초 polling + 변경 후 debounced push 로 호출.
 */
export async function POST(request: NextRequest) {
  const [user, deny] = await guardUser();
  if (deny) return deny;

  const body = (await request.json()) as SyncBody;
  const incoming = body.sessions ?? [];
  const deletedIds = body.deletedIds ?? [];

  // 서버 현재 상태 일괄 조회 (N+1 방지)
  const ids = Array.from(new Set([...incoming.map((s) => s.id), ...deletedIds]));
  const existing = ids.length
    ? await prisma.posSession.findMany({
        where: { userId: user.id, id: { in: ids } },
      })
    : [];
  const existingById = new Map(existing.map((r) => [r.id, r]));

  // 1) 삭제 — 본인 user 의 세션만
  if (deletedIds.length > 0) {
    await prisma.posSession.deleteMany({
      where: { userId: user.id, id: { in: deletedIds } },
    });
  }

  // 2) upsert — 클라이언트 updatedAt > 서버 updatedAt 일 때만 update
  const upserts: Promise<unknown>[] = [];
  for (const s of incoming) {
    if (deletedIds.includes(s.id)) continue;
    const server = existingById.get(s.id);
    const clientUpdatedAt = s.updatedAt ? new Date(s.updatedAt) : new Date();

    const payload: Prisma.PosSessionUncheckedCreateInput = {
      id: s.id,
      userId: user.id,
      customerId: s.customerId ?? null,
      customerName: s.customerName ?? null,
      customerPhone: s.customerPhone ?? null,
      label: s.label ?? "고객",
      totalDiscount: s.totalDiscount ?? "0",
      shippingCost: s.shippingCost ?? "0",
      items: (s.items ?? []) as Prisma.InputJsonValue,
      quotationId: s.quotationId ?? null,
      quotationFingerprint: s.quotationFingerprint ?? null,
      labelCodes:
        s.labelCodes != null ? (s.labelCodes as Prisma.InputJsonValue) : Prisma.DbNull,
      labelFingerprint: s.labelFingerprint ?? null,
      repairTicketIds:
        s.repairTicketIds != null
          ? (s.repairTicketIds as Prisma.InputJsonValue)
          : Prisma.DbNull,
      openRepairCount: s.openRepairCount ?? null,
    };

    if (!server) {
      upserts.push(prisma.posSession.create({ data: payload }));
    } else if (clientUpdatedAt > server.updatedAt) {
      // 클라이언트가 더 새거 — 서버 갱신
      upserts.push(
        prisma.posSession.update({
          where: { id: s.id },
          data: payload,
        }),
      );
    }
    // server.updatedAt 이 더 새거나 같으면 — 서버 win, 무시
  }
  if (upserts.length > 0) await Promise.all(upserts);

  // 3) 응답 — 현재 user 의 모든 세션 (서버 win 결과 반영)
  const fresh = await prisma.posSession.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(fresh.map(toClientShape));
}
