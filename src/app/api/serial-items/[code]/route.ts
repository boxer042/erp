import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import { serialDetailInclude, buildSerialProfile } from "@/lib/serial-profile";

// GET /api/serial-items/[code] — 매장 직원용 상세 (풀 프로파일 + 토큰 + 접근로그).
// POS 수리 접수 스캔도 이 엔드포인트로 시리얼 조회.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const [, deny] = await guardUser();
  if (deny) return deny;
  const { code } = await params;

  const raw = await prisma.serialItem.findUnique({
    where: { code },
    include: serialDetailInclude,
  });
  if (!raw) {
    return NextResponse.json({ error: "시리얼을 찾을 수 없습니다" }, { status: 404 });
  }

  const accessLogs = await prisma.serialAccessLog.findMany({
    where: { serialItemId: raw.id },
    orderBy: { accessedAt: "desc" },
    take: 50,
  });

  const profile = buildSerialProfile(raw, { masked: false });
  return NextResponse.json({
    id: raw.id,
    ...profile,
    memo: raw.memo,
    accessToken: raw.accessToken,
    accessTokenRevokedAt: raw.accessTokenRevokedAt,
    accessLogs,
  });
}

const patchSchema = z.object({
  customerId: z.string().nullable().optional(),
  memo: z.string().nullable().optional(),
  status: z.enum(["ACTIVE", "RETURNED", "SCRAPPED"]).optional(),
  displayName: z.string().nullable().optional(),
  warrantyEnds: z.string().nullable().optional(),
});

// PATCH /api/serial-items/[code] — 손님 이전·메모·상태·기기명·보증 편집.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const [user, deny] = await guardUser();
  if (deny) return deny;
  const { code } = await params;

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  const existing = await prisma.serialItem.findUnique({
    where: { code },
    select: {
      id: true,
      customerId: true,
      status: true,
      memo: true,
      displayName: true,
      warrantyEnds: true,
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "시리얼을 찾을 수 없습니다" }, { status: 404 });
  }

  const updated = await prisma.serialItem.update({
    where: { code },
    data: {
      ...(d.customerId !== undefined ? { customerId: d.customerId } : {}),
      ...(d.memo !== undefined ? { memo: d.memo } : {}),
      ...(d.status !== undefined ? { status: d.status } : {}),
      ...(d.displayName !== undefined ? { displayName: d.displayName } : {}),
      ...(d.warrantyEnds !== undefined
        ? { warrantyEnds: d.warrantyEnds ? new Date(d.warrantyEnds) : null }
        : {}),
    },
  });

  const customerChanged =
    d.customerId !== undefined && d.customerId !== existing.customerId;
  await recordAudit(prisma, {
    userId: user.id,
    entity: "SerialItem",
    entityId: existing.id,
    action: customerChanged || d.status !== undefined ? "STATUS_CHANGE" : "UPDATE",
    before: existing,
    after: {
      customerId: updated.customerId,
      status: updated.status,
      memo: updated.memo,
      displayName: updated.displayName,
      warrantyEnds: updated.warrantyEnds,
    },
    meta: customerChanged ? { transferredCustomer: true } : undefined,
  });

  return NextResponse.json({ ok: true });
}
