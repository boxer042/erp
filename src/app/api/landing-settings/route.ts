import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { landingBlocksSchema } from "@/lib/validators/landing-block";

const SINGLETON_ID = "singleton";

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
  await prisma.landingSettings.upsert({
    where: { id: SINGLETON_ID },
    update: { footerBlocks: parsed.data },
    create: { id: SINGLETON_ID, footerBlocks: parsed.data },
  });
  return NextResponse.json({ footerBlocks: parsed.data });
}
