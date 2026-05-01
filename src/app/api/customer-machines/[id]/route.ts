import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, handleAuthError } from "@/lib/api-auth";

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  brand: z.string().trim().nullable().optional(),
  modelNo: z.string().trim().nullable().optional(),
  serialNo: z.string().trim().nullable().optional(),
  productId: z.string().nullable().optional(),
  purchasedAt: z.union([z.string(), z.null()]).optional(),
  purchasedFrom: z.string().trim().nullable().optional(),
  memo: z.string().trim().nullable().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
    const { id } = await params;
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;
    const machine = await prisma.customerMachine.update({
      where: { id },
      data: {
        ...(d.name !== undefined ? { name: d.name } : {}),
        ...(d.brand !== undefined ? { brand: d.brand?.trim() || null } : {}),
        ...(d.modelNo !== undefined ? { modelNo: d.modelNo?.trim() || null } : {}),
        ...(d.serialNo !== undefined ? { serialNo: d.serialNo?.trim() || null } : {}),
        ...(d.productId !== undefined ? { productId: d.productId || null } : {}),
        ...(d.purchasedAt !== undefined
          ? { purchasedAt: d.purchasedAt ? new Date(d.purchasedAt) : null }
          : {}),
        ...(d.purchasedFrom !== undefined
          ? { purchasedFrom: d.purchasedFrom?.trim() || null }
          : {}),
        ...(d.memo !== undefined ? { memo: d.memo?.trim() || null } : {}),
      },
    });
    return NextResponse.json(machine);
  } catch (e) {
    const authResp = handleAuthError(e);
    if (authResp) return authResp;
    throw e;
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
    const { id } = await params;
    await prisma.customerMachine.update({
      where: { id },
      data: { isActive: false },
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    const authResp = handleAuthError(e);
    if (authResp) return authResp;
    throw e;
  }
}
