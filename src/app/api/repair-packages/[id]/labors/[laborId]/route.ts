import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardAdmin } from "@/lib/api-auth";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; laborId: string }> }
) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;
  const { laborId } = await params;
  await prisma.repairPackageLabor.delete({ where: { id: laborId } });
  return NextResponse.json({ ok: true });
}
