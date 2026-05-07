/**
 * GET /api/channels/pending — import 보류 큐 조회
 *
 * filter:
 *  - channelId (선택)
 *  - status (선택, default: 모든 상태)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get("channelId");
  const status = searchParams.get("status");

  const where: Prisma.PendingChannelOrderWhereInput = {
    ...(channelId ? { channelId } : {}),
    ...(status
      ? { status: status as Prisma.PendingChannelOrderWhereInput["status"] }
      : {}),
  };

  const pendings = await prisma.pendingChannelOrder.findMany({
    where,
    include: {
      channel: { select: { id: true, name: true, code: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json(pendings);
}
