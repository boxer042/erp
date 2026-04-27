import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const assembly = await prisma.assembly.findUnique({
    where: { id },
    include: {
      product: { select: { id: true, name: true, sku: true } },
      consumptions: {
        include: { component: { select: { id: true, name: true, sku: true } } },
      },
    },
  });
  if (!assembly) {
    return NextResponse.json({ error: "조립 실적을 찾을 수 없습니다" }, { status: 404 });
  }
  return NextResponse.json(assembly);
}
