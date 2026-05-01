import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { customerSchema } from "@/lib/validators/customer";
import { guardUser } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const [, deny] = await guardUser();
  if (deny) return deny;
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const includeInactive = searchParams.get("includeInactive") === "1";

  const customers = await prisma.customer.findMany({
    where: {
      ...(includeInactive ? {} : { isActive: true }),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { phone: { contains: search } },
              { businessNumber: { contains: search } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(customers);
}

export async function POST(request: NextRequest) {
  const [, deny] = await guardUser();
  if (deny) return deny;
  const body = await request.json();
  const parsed = customerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const customer = await prisma.customer.create({
    data: {
      name: data.name,
      phone: data.phone,
      businessNumber: data.businessNumber || null,
      ceo: data.ceo || null,
      email: data.email || null,
      address: data.address || null,
      memo: data.memo || null,
    },
  });

  return NextResponse.json(customer, { status: 201 });
}
