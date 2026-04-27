import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const customerId = request.nextUrl.searchParams.get("customerId");
  if (!customerId) return NextResponse.json({ error: "customerId 필수" }, { status: 400 });
  const notes = await prisma.customerNote.findMany({
    where: { customerId },
    include: { createdBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(notes);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  const body = await request.json();
  const { customerId, content } = body ?? {};
  if (!customerId || !content?.trim()) {
    return NextResponse.json({ error: "customerId, content 필수" }, { status: 400 });
  }
  const note = await prisma.customerNote.create({
    data: {
      customerId,
      content: content.trim(),
      createdById: user.id,
    },
    include: { createdBy: { select: { name: true } } },
  });
  return NextResponse.json(note, { status: 201 });
}
