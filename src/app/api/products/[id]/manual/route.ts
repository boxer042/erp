import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import { parseManualBlocks } from "@/lib/manual-blocks";

// GET /api/products/[id]/manual — 매뉴얼 에디터 로드.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await guardUser();
  if (deny) return deny;
  const { id } = await params;

  const product = await prisma.product.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      modelName: true,
      imageUrl: true,
      manualBlocks: true,
      hasManual: true,
    },
  });
  if (!product) {
    return NextResponse.json({ error: "상품을 찾을 수 없습니다" }, { status: 404 });
  }

  return NextResponse.json({
    id: product.id,
    name: product.name,
    modelName: product.modelName,
    imageUrl: product.imageUrl,
    hasManual: product.hasManual,
    blocks: parseManualBlocks(product.manualBlocks),
  });
}

const putSchema = z.object({ blocks: z.array(z.unknown()) });

// PUT /api/products/[id]/manual — 매뉴얼 블록 저장.
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
  const product = await prisma.product.update({
    where: { id },
    data: {
      manualBlocks: blocks as unknown as Prisma.InputJsonValue,
      hasManual: blocks.length > 0,
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, id: product.id });
}
