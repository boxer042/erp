import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { landingBlocksSchema } from "@/lib/validators/landing-block";
import { ensureProductHeroFirst } from "@/lib/landing-blocks-utils";
import { extractHtmlStoragePaths, extractHtmlStoragePath } from "@/lib/html-utils";

const HTML_BUCKET = "product-html";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const product = await prisma.product.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      sku: true,
      imageUrl: true,
      landingBlocks: true,
      landingMode: true,
      singleHtmlUrl: true,
    },
  });
  if (!product) {
    return NextResponse.json({ error: "상품을 찾을 수 없습니다" }, { status: 404 });
  }

  const raw = product.landingBlocks ?? [];
  const parsed = landingBlocksSchema.safeParse(raw);
  // SINGLE_HTML 모드는 블록 미사용. BLOCKS 모드에서만 product-hero 자동 보장.
  const blocks = product.landingMode === "BLOCKS"
    ? ensureProductHeroFirst(parsed.success ? parsed.data : [])
    : (parsed.success ? parsed.data : []);
  return NextResponse.json({
    id: product.id,
    name: product.name,
    sku: product.sku,
    imageUrl: product.imageUrl,
    blocks,
    landingMode: product.landingMode,
    singleHtmlUrl: product.singleHtmlUrl,
  });
}

const putBodySchema = z.object({
  blocks: landingBlocksSchema.optional(),
  landingMode: z.enum(["BLOCKS", "SINGLE_HTML"]).optional(),
  singleHtmlUrl: z.string().nullable().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const parsed = putBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // 변경 전 상태 조회 (storage orphan 청소용)
  const previous = await prisma.product.findUnique({
    where: { id },
    select: { landingBlocks: true, singleHtmlUrl: true },
  });

  const updateData: {
    landingBlocks?: typeof parsed.data.blocks;
    landingMode?: "BLOCKS" | "SINGLE_HTML";
    singleHtmlUrl?: string | null;
  } = {};
  if (parsed.data.blocks !== undefined) updateData.landingBlocks = parsed.data.blocks;
  if (parsed.data.landingMode !== undefined) updateData.landingMode = parsed.data.landingMode;
  if (parsed.data.singleHtmlUrl !== undefined) updateData.singleHtmlUrl = parsed.data.singleHtmlUrl;

  await prisma.product.update({ where: { id }, data: updateData });

  // Storage orphan 청소: 이전 상태에서 참조했던 html 파일 중 새 상태에 없는 것 삭제
  await cleanupOrphanHtml(previous, parsed.data);

  return NextResponse.json({
    blocks: parsed.data.blocks,
    landingMode: parsed.data.landingMode,
    singleHtmlUrl: parsed.data.singleHtmlUrl,
  });
}

async function cleanupOrphanHtml(
  previous:
    | { landingBlocks: unknown; singleHtmlUrl: string | null }
    | null,
  next: z.infer<typeof putBodySchema>,
) {
  try {
    const oldPaths = new Set<string>();
    if (previous?.landingBlocks) {
      const oldParsed = landingBlocksSchema.safeParse(previous.landingBlocks);
      if (oldParsed.success) {
        for (const p of extractHtmlStoragePaths(oldParsed.data)) oldPaths.add(p);
      }
    }
    if (previous?.singleHtmlUrl) {
      const p = extractHtmlStoragePath(previous.singleHtmlUrl);
      if (p) oldPaths.add(p);
    }

    const newPaths = new Set<string>();
    if (next.blocks) {
      for (const p of extractHtmlStoragePaths(next.blocks)) newPaths.add(p);
    }
    if (next.singleHtmlUrl) {
      const p = extractHtmlStoragePath(next.singleHtmlUrl);
      if (p) newPaths.add(p);
    }
    // blocks/singleHtmlUrl 가 PUT 에 없으면 그 부분은 변경 없음 → 청소 대상 아님
    // 그래서 oldPaths 중에서도 "이번에 명시적으로 비워졌거나 교체된" 항목만 청소
    if (next.blocks === undefined) {
      // blocks 미지정 → 기존 blocks 의 paths 는 살림
      const oldParsed = previous?.landingBlocks
        ? landingBlocksSchema.safeParse(previous.landingBlocks)
        : null;
      if (oldParsed?.success) {
        for (const p of extractHtmlStoragePaths(oldParsed.data)) newPaths.add(p);
      }
    }
    if (next.singleHtmlUrl === undefined && previous?.singleHtmlUrl) {
      const p = extractHtmlStoragePath(previous.singleHtmlUrl);
      if (p) newPaths.add(p);
    }

    const orphans = [...oldPaths].filter((p) => !newPaths.has(p));
    if (orphans.length === 0) return;

    const supabase = await createClient();
    const { error } = await supabase.storage.from(HTML_BUCKET).remove(orphans);
    if (error) {
      console.warn("[products/landing] orphan cleanup failed", error);
    }
  } catch (e) {
    console.warn("[products/landing] cleanup error", e);
  }
}
