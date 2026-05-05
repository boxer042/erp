import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";

/**
 * POS 카트 세션 — user 별 격리. 디바이스간 공유.
 *
 * GET  /api/pos/sessions          — 현재 user 의 모든 활성(soft delete 안 된) 세션
 * POST /api/pos/sessions/sync     — 클라이언트 → 서버 일괄 sync
 *                                    (서버 → 클라이언트 merge 결과 반환)
 *
 * 부활 방지: PosSession.deletedAt 로 soft delete.
 *  - 다른 기기가 옛 sessionStorage 의 deleted session 을 sync 시도하면 server 가 거부.
 *  - 응답에 rejectedIds 포함 → 클라이언트가 자기 sessionStorage 에서도 제거.
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

interface SyncResponse {
  sessions: ReturnType<typeof toClientShape>[];
  /** 클라이언트가 보냈지만 서버 측에서 이미 삭제된 (또는 거부된) ID 들 — 클라이언트도 sessionStorage 에서 제거해야 부활 안 함 */
  rejectedIds: string[];
}

export async function GET() {
  const [user, deny] = await guardUser();
  if (deny) return deny;

  const rows = await prisma.posSession.findMany({
    where: { userId: user.id, deletedAt: null },
    orderBy: { updatedAt: "desc" },
  });
  const shaped = await toClientShapes(rows);
  return NextResponse.json({ sessions: shaped, rejectedIds: [] });
}

type SessionRow = Awaited<ReturnType<typeof prisma.posSession.findFirst>>;

function toClientShape(r: NonNullable<SessionRow>) {
  return {
    id: r.id,
    customerId: r.customerId,
    customerName: r.customerName,
    customerPhone: r.customerPhone,
    label: r.label,
    totalDiscount: r.totalDiscount,
    shippingCost: r.shippingCost,
    items: r.items,
    quotationId: r.quotationId,
    quotationFingerprint: r.quotationFingerprint,
    labelCodes: r.labelCodes,
    labelFingerprint: r.labelFingerprint,
    repairTicketIds: r.repairTicketIds,
    openRepairCount: 0, // 동적 계산값으로 덮어씀 (toClientShapes)
    updatedAt: r.updatedAt.toISOString(),
  };
}

/**
 * openRepairCount 동적 계산해서 응답에 포함.
 * - PosSession.openRepairCount column 은 신뢰하지 않음
 * - customer 별 / repairTicketIds 별 진행중 카운트, 단 카트 안 repair 라인은 제외
 *
 * N+1 방지: 모든 sessions 의 ticket 후보를 한 번에 fetch.
 */
async function toClientShapes(rows: NonNullable<SessionRow>[]) {
  if (rows.length === 0) return [];

  const customerIds = Array.from(
    new Set(rows.map((r) => r.customerId).filter((v): v is string => !!v)),
  );
  const trackedIds = new Set<string>();
  for (const r of rows) {
    const ids = (r.repairTicketIds as unknown as string[] | null) ?? [];
    for (const id of ids) trackedIds.add(id);
  }

  const tickets = await prisma.repairTicket.findMany({
    where: {
      OR: [
        ...(customerIds.length ? [{ customerId: { in: customerIds } }] : []),
        ...(trackedIds.size ? [{ id: { in: Array.from(trackedIds) } }] : []),
      ],
      status: { notIn: ["PICKED_UP", "CANCELLED"] },
    },
    select: { id: true, customerId: true, status: true },
  });

  const ticketsByCustomer = new Map<string, typeof tickets>();
  const ticketIdSet = new Set<string>();
  for (const t of tickets) {
    ticketIdSet.add(t.id);
    if (t.customerId) {
      const arr = ticketsByCustomer.get(t.customerId) ?? [];
      arr.push(t);
      ticketsByCustomer.set(t.customerId, arr);
    }
  }

  return rows.map((r) => {
    const items =
      (r.items as unknown as Array<{
        itemType?: string;
        repairMeta?: { repairTicketId?: string };
      }>) ?? [];
    const cartRepairIds = new Set<string>();
    for (const it of items) {
      if (it.itemType === "repair" && it.repairMeta?.repairTicketId) {
        cartRepairIds.add(it.repairMeta.repairTicketId);
      }
    }

    let openCount = 0;
    if (r.customerId) {
      const list = ticketsByCustomer.get(r.customerId) ?? [];
      openCount = list.filter((t) => !cartRepairIds.has(t.id)).length;
    } else {
      const ids = (r.repairTicketIds as unknown as string[] | null) ?? [];
      openCount = ids.filter(
        (id) => ticketIdSet.has(id) && !cartRepairIds.has(id),
      ).length;
    }

    return { ...toClientShape(r), openRepairCount: openCount };
  });
}

interface SyncBody {
  sessions: SessionPayload[];
  deletedIds?: string[];
}

/**
 * 일괄 sync — last-write-wins(updatedAt 비교) + soft delete 거부.
 */
export async function POST(request: NextRequest) {
  const [user, deny] = await guardUser();
  if (deny) return deny;

  const body = (await request.json()) as SyncBody;
  const incoming = body.sessions ?? [];
  const deletedIds = body.deletedIds ?? [];

  // 서버 현재 상태 — soft deleted 포함 모두 가져와 분기 (incoming 의 id, deletedIds 모두 커버)
  const lookupIds = Array.from(
    new Set([...incoming.map((s) => s.id), ...deletedIds]),
  );
  const existing = lookupIds.length
    ? await prisma.posSession.findMany({
        where: { userId: user.id, id: { in: lookupIds } },
      })
    : [];
  const existingById = new Map(existing.map((r) => [r.id, r]));

  // 1) 삭제 — 본인 user 의 세션만, soft delete (다른 기기가 옛 데이터로 부활 시도해도 거부)
  if (deletedIds.length > 0) {
    await prisma.posSession.updateMany({
      where: { userId: user.id, id: { in: deletedIds }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  // 2) upsert + rejectedIds 수집
  const rejectedIds: string[] = [];
  const upserts: Promise<unknown>[] = [];
  for (const s of incoming) {
    if (deletedIds.includes(s.id)) continue;
    const server = existingById.get(s.id);

    // 다른 기기가 삭제한 세션 — 거부 (클라이언트가 sessionStorage 에서 제거하도록 알림)
    if (server && server.deletedAt) {
      rejectedIds.push(s.id);
      continue;
    }

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
      upserts.push(
        prisma.posSession.update({ where: { id: s.id }, data: payload }),
      );
    }
  }
  if (upserts.length > 0) await Promise.all(upserts);

  // 3) 응답 — 현재 user 의 활성 세션 + rejected ID 들
  const fresh = await prisma.posSession.findMany({
    where: { userId: user.id, deletedAt: null },
    orderBy: { updatedAt: "desc" },
  });
  const shaped = await toClientShapes(fresh);
  const response: SyncResponse = { sessions: shaped, rejectedIds };
  return NextResponse.json(response);
}
