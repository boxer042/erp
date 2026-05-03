import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { landingBlocksSchema } from "@/lib/validators/landing-block";
import { extractHtmlStoragePaths } from "@/lib/html-utils";

const SINGLETON_ID = "singleton";
const HTML_BUCKET = "product-html";

export async function GET() {
  const row = await prisma.landingSettings.findUnique({ where: { id: SINGLETON_ID } });
  const raw = row?.footerBlocks ?? [];
  const parsed = landingBlocksSchema.safeParse(raw);
  return NextResponse.json({ footerBlocks: parsed.success ? parsed.data : [] });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const parsed = landingBlocksSchema.safeParse(body.footerBlocks);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const previous = await prisma.landingSettings.findUnique({ where: { id: SINGLETON_ID } });

  await prisma.landingSettings.upsert({
    where: { id: SINGLETON_ID },
    update: { footerBlocks: parsed.data },
    create: { id: SINGLETON_ID, footerBlocks: parsed.data },
  });

  // Storage orphan 청소
  try {
    const oldParsed = previous?.footerBlocks
      ? landingBlocksSchema.safeParse(previous.footerBlocks)
      : null;
    const oldPaths = oldParsed?.success ? extractHtmlStoragePaths(oldParsed.data) : [];
    const newPaths = new Set(extractHtmlStoragePaths(parsed.data));
    const orphans = oldPaths.filter((p) => !newPaths.has(p));
    if (orphans.length > 0) {
      const supabase = await createClient();
      const { error } = await supabase.storage.from(HTML_BUCKET).remove(orphans);
      if (error) console.warn("[landing-settings] orphan cleanup failed", error);
    }
  } catch (e) {
    console.warn("[landing-settings] cleanup error", e);
  }

  return NextResponse.json({ footerBlocks: parsed.data });
}
