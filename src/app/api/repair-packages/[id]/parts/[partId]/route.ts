import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardAdmin } from "@/lib/api-auth";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; partId: string }> }
) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;
  const { partId } = await params;
  await prisma.repairPackagePart.delete({ where: { id: partId } });
  return NextResponse.json({ ok: true });
}
