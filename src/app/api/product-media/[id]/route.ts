import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { type, url, title, sortOrder } = body ?? {};
  const media = await prisma.productMedia.update({
    where: { id },
    data: {
      ...(type ? { type } : {}),
      ...(url !== undefined ? { url: String(url).trim() } : {}),
      ...(title !== undefined ? { title: title?.trim() || null } : {}),
      ...(typeof sortOrder === "number" ? { sortOrder } : {}),
    },
  });
  return NextResponse.json(media);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.productMedia.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
