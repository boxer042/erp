import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; laborId: string }> }
) {
  const { laborId } = await params;
  await prisma.repairLabor.delete({ where: { id: laborId } });
  return NextResponse.json({ success: true });
}
