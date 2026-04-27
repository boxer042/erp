import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { orderSchema } from "@/lib/validators/order";
import { getCurrentUser } from "@/lib/auth";

function generateOrderNo() {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const r = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD${y}${m}${d}-${r}`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const channelId = searchParams.get("channelId");
  const search = searchParams.get("search") || "";

  const orders = await prisma.order.findMany({
    where: {
      ...(status ? { status: status as never } : {}),
      ...(channelId ? { channelId } : {}),
      ...(search
        ? {
            OR: [
              { orderNo: { contains: search, mode: "insensitive" as const } },
              { channelOrderNo: { contains: search, mode: "insensitive" as const } },
              { customerName: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    include: {
      channel: { select: { name: true, code: true } },
      createdBy: { select: { name: true } },
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(orders);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = orderSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  // 채널 수수료율 조회
  const channel = await prisma.salesChannel.findUnique({
    where: { id: data.channelId },
  });

  if (!channel) {
    return NextResponse.json({ error: "채널을 찾을 수 없습니다" }, { status: 404 });
  }

  const items = data.items.map((item) => {
    const qty = parseFloat(item.quantity);
    const price = parseFloat(item.unitPrice);
    return {
      productId: item.productId,
      quantity: qty,
      unitPrice: price,
      totalPrice: qty * price,
    };
  });

  const subtotalAmount = items.reduce((sum, i) => sum + i.totalPrice, 0);
  const discountAmount = parseFloat(data.discountAmount || "0");
  const shippingFee = parseFloat(data.shippingFee || "0");
  const taxAmount = Math.round((subtotalAmount - discountAmount) * 0.1); // 부가세 10%
  const totalAmount = subtotalAmount - discountAmount + shippingFee + taxAmount;
  const commissionAmount = Math.round(subtotalAmount * Number(channel.commissionRate));

  const order = await prisma.order.create({
    data: {
      orderNo: generateOrderNo(),
      channelId: data.channelId,
      channelOrderNo: data.channelOrderNo || null,
      customerName: data.customerName || null,
      customerPhone: data.customerPhone || null,
      shippingAddress: data.shippingAddress || null,
      orderDate: new Date(data.orderDate),
      subtotalAmount,
      discountAmount,
      shippingFee,
      taxAmount,
      totalAmount,
      commissionAmount,
      memo: data.memo || null,
      createdById: user.id,
      items: { create: items },
    },
    include: {
      channel: { select: { name: true } },
      items: {
        include: { product: { select: { name: true, sku: true } } },
      },
    },
  });

  return NextResponse.json(order, { status: 201 });
}
