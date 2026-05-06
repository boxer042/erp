import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { channelSchema } from "@/lib/validators/channel";
import { guardAdmin } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  // 기본은 활성만. 관리 페이지에서 ?includeInactive=1 로 비활성 포함 조회.
  const includeInactive = searchParams.get("includeInactive") === "1";
  const channels = await prisma.salesChannel.findMany({
    where: includeInactive ? undefined : { isActive: true },
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
