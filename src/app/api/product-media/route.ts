import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const [, deny] = await guardUser();
  if (deny) return deny;
  const productId = request.nextUrl.searchParams.get("productId");
  if (!productId) {
    return NextResponse.json({ error: "productId가 필요합니다" }, { status: 400 });
  }
  const media = await prisma.productMedia.findMany({
    where: { productId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(media);
}

export async function POST(request: NextRequest) {
  const [, deny] = await guardUser();
  if (deny) return deny;
  const body = await request.json();
  const { productId, type, url, title, sortOrder } = body ?? {};
  if (!productId || !type || !url) {
    return NextResponse.json({ error: "productId, type, url 필수" }, { status: 400 });
  }
  if (type !== "IMAGE" && type !== "YOUTUBE") {
    return NextResponse.json({ error: "type은 IMAGE 또는 YOUTUBE" }, { status: 400 });
  }
  const media = await prisma.productMedia.create({
    data: {
      productId,
      type,
      url: String(url).trim(),
      title: title?.trim() || null,
      sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
    },
  });
  return NextResponse.json(media, { status: 201 });
}
