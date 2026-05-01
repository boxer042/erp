import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardAdmin } from "@/lib/api-auth";
import { cardMerchantInfoSchema } from "@/lib/validators/card-company-fee";

export async function PUT(request: NextRequest) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;

  const body = await request.json();
  const parsed = cardMerchantInfoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  const updated = await prisma.cardMerchantInfo.upsert({
    where: { id: "singleton" },
    update: {
      merchantTier: d.merchantTier ?? null,
      appliedFrom: d.appliedFrom ? new Date(d.appliedFrom) : null,
    },
    create: {
      id: "singleton",
      merchantTier: d.merchantTier ?? null,
      appliedFrom: d.appliedFrom ? new Date(d.appliedFrom) : null,
    },
  });

  return NextResponse.json(updated);
}
