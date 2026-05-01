import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, handleAuthError } from "@/lib/api-auth";

const createSchema = z.object({
  customerId: z.string().min(1),
  content: z.string().trim().min(1).max(5000),
});

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const customerId = request.nextUrl.searchParams.get("customerId");
    if (!customerId) return NextResponse.json({ error: "customerId 필수" }, { status: 400 });
    const notes = await prisma.customerNote.findMany({
      where: { customerId },
      include: { createdBy: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(notes);
  } catch (e) {
    const authResp = handleAuthError(e);
    if (authResp) return authResp;
    throw e;
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const note = await prisma.customerNote.create({
      data: {
        customerId: parsed.data.customerId,
        content: parsed.data.content,
        createdById: user.id,
      },
      include: { createdBy: { select: { name: true } } },
    });
    return NextResponse.json(note, { status: 201 });
  } catch (e) {
    const authResp = handleAuthError(e);
    if (authResp) return authResp;
    throw e;
  }
}
