import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { landingBlocksSchema } from "@/lib/validators/landing-block";
import { extractHtmlStoragePaths } from "@/lib/html-utils";

const SINGLETON_ID = "singleton";
const HTML_BUCKET = "product-html";

export async function GET() {
  const row = await prisma.landingSettings.findUnique({ where: { id: SINGLETON_ID } });
  const headerRaw = row?.headerBlocks ?? [];
  const footerRaw = row?.footerBlocks ?? [];
  const headerParsed = landingBlocksSchema.safeParse(headerRaw);
  const footerParsed = landingBlocksSchema.safeParse(footerRaw);
  return NextResponse.json({
    headerBlocks: headerParsed.success ? headerParsed.data : [],
    footerBlocks: footerParsed.success ? footerParsed.data : [],
  });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();

  // 한 번에 둘 다 보낼 수도 있고 한 쪽만 보낼 수도 있음
  const updates: Prisma.LandingSettingsUpdateInput = {};

  if (body.headerBlocks !== undefined) {
    const parsed = landingBlocksSchema.safeParse(body.headerBlocks);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { headerBlocks: parsed.error.flatten() } },
        { status: 400 },
      );
    }
    updates.headerBlocks = parsed.data as Prisma.InputJsonValue;
  }

  if (body.footerBlocks !== undefined) {
    const parsed = landingBlocksSchema.safeParse(body.footerBlocks);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { footerBlocks: parsed.error.flatten() } },
        { status: 400 },
      );
    }
    updates.footerBlocks = parsed.data as Prisma.InputJsonValue;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "headerBlocks 또는 footerBlocks 중 하나 이상 전달 필요" },
      { status: 400 },
    );
  }

  const previous = await prisma.landingSettings.findUnique({ where: { id: SINGLETON_ID } });

  await prisma.landingSettings.upsert({
    where: { id: SINGLETON_ID },
    update: updates,
    create: {
      id: SINGLETON_ID,
      headerBlocks: (updates.headerBlocks ?? []) as Prisma.InputJsonValue,
      footerBlocks: (updates.footerBlocks ?? []) as Prisma.InputJsonValue,
    },
  });

  // Storage orphan 청소 — header/footer 둘 다 검사
  try {
    const oldHeader = previous?.headerBlocks
      ? landingBlocksSchema.safeParse(previous.headerBlocks)
      : null;
    const oldFooter = previous?.footerBlocks
      ? landingBlocksSchema.safeParse(previous.footerBlocks)
      : null;
    const oldPaths = [
      ...(oldHeader?.success ? extractHtmlStoragePaths(oldHeader.data) : []),
      ...(oldFooter?.success ? extractHtmlStoragePaths(oldFooter.data) : []),
    ];

    const newHeader = updates.headerBlocks
      ? (updates.headerBlocks as Awaited<ReturnType<typeof landingBlocksSchema.parse>>)
      : oldHeader?.success
        ? oldHeader.data
        : [];
    const newFooter = updates.footerBlocks
      ? (updates.footerBlocks as Awaited<ReturnType<typeof landingBlocksSchema.parse>>)
      : oldFooter?.success
        ? oldFooter.data
        : [];
    const newPaths = new Set([
      ...extractHtmlStoragePaths(newHeader),
      ...extractHtmlStoragePaths(newFooter),
    ]);
    const orphans = oldPaths.filter((p) => !newPaths.has(p));
    if (orphans.length > 0) {
      const supabase = await createClient();
      const { error } = await supabase.storage.from(HTML_BUCKET).remove(orphans);
      if (error) console.warn("[landing-settings] orphan cleanup failed", error);
    }
  } catch (e) {
    console.warn("[landing-settings] cleanup error", e);
  }

  // 응답에는 항상 둘 다 반환
  const fresh = await prisma.landingSettings.findUnique({ where: { id: SINGLETON_ID } });
  const headerOut = landingBlocksSchema.safeParse(fresh?.headerBlocks ?? []);
  const footerOut = landingBlocksSchema.safeParse(fresh?.footerBlocks ?? []);

  return NextResponse.json({
    headerBlocks: headerOut.success ? headerOut.data : [],
    footerBlocks: footerOut.success ? footerOut.data : [],
  });
}
