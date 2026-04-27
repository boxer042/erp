import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { channelSchema } from "@/lib/validators/channel";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const channel = await prisma.salesChannel.findUnique({
    where: { id },
    include: { channelFees: true },
  });

  if (!channel) {
    return NextResponse.json({ error: "채널을 찾을 수 없습니다" }, { status: 404 });
  }

  return NextResponse.json(channel);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const parsed = channelSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { name, code, commissionRate, memo } = parsed.data;

  const channel = await prisma.salesChannel.update({
    where: { id },
    data: {
      name,
      code,
      commissionRate: parseFloat(commissionRate) / 100,
      memo: memo || null,
    },
  });

  return NextResponse.json(channel);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.salesChannel.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
