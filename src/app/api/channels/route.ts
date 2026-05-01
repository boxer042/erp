import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { channelSchema } from "@/lib/validators/channel";
import { guardAdmin } from "@/lib/api-auth";

export async function GET() {
  const channels = await prisma.salesChannel.findMany({
    include: { channelFees: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(channels);
}

export async function POST(request: NextRequest) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;
  const body = await request.json();
  const parsed = channelSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { name, code, commissionRate, memo, logoUrl, logoPath } = parsed.data;

  const channel = await prisma.salesChannel.create({
    data: {
      name,
      code,
      commissionRate: parseFloat(commissionRate) / 100,
      memo: memo || null,
      logoUrl: logoUrl ?? null,
      logoPath: logoPath ?? null,
    },
  });

  return NextResponse.json(channel, { status: 201 });
}
