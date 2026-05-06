import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardAdmin } from "@/lib/api-auth";

/**
 * Audit Log 조회 — ADMIN 전용.
 *
 * Query: entity, action, userId, from, to, limit (default 200, max 1000)
 */
export async function GET(request: NextRequest) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;

  const { searchParams } = new URL(request.url);
  const entity = searchParams.get("entity");
  const action = searchParams.get("action");
  const userId = searchParams.get("userId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const limit = Math.min(1000, parseInt(searchParams.get("limit") || "200", 10));

  const createdAtFilter: { gte?: Date; lt?: Date } = {};
  if (from) createdAtFilter.gte = new Date(from);
  if (to) {
    const t = new Date(to);
    t.setDate(t.getDate() + 1);
    createdAtFilter.lt = t;
  }

  const rows = await prisma.auditLog.findMany({
    where: {
      ...(entity ? { entity } : {}),
      ...(action ? { action } : {}),
      ...(userId ? { userId } : {}),
      ...(from || to ? { createdAt: createdAtFilter } : {}),
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json(rows);
}
