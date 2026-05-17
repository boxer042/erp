import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import { parseManualBlocks } from "@/lib/manual-blocks";

// GET /api/rental-assets/[id]/manual — 임대 자산 사용설명서 로드.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await guardUser();
  if (deny) return deny;
  const { id } = await params;

  const asset = await prisma.rentalAsset.findUnique({
    where: { id },
    select: { id: true, name: true, manualBlocks: true, hasManual: true },
  });
  if (!asset) {
    return NextResponse.json(
      { error: "임대 자산을 찾을 수 없습니다" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    id: asset.id,
    name: asset.name,
    blocks: parseManualBlocks(asset.manualBlocks),
  });
}

const putSchema = z.object({ blocks: z.array(z.unknown()) });

// PUT /api/rental-assets/[id]/manual — 사용설명서 블록 저장.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await guardUser();
  if (deny) return deny;
  const { id } = await params;

  const body = await request.json();
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const blocks = parseManualBlocks(parsed.data.blocks);
  await prisma.rentalAsset.update({
    where: { id },
    data: {
      manualBlocks: blocks as unknown as Prisma.InputJsonValue,
      hasManual: blocks.length > 0,
    },
  });

  return NextResponse.json({ ok: true });
}
