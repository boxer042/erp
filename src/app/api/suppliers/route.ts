import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supplierSchema } from "@/lib/validators/supplier";
import { guardUser } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const [, deny] = await guardUser();
  if (deny) return deny;
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";

  const suppliers = await prisma.supplier.findMany({
    where: search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { businessNumber: { contains: search } },
          ],
        }
      : undefined,
    include: { contacts: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(suppliers);
}

export async function POST(request: NextRequest) {
  const [, deny] = await guardUser();
  if (deny) return deny;
  const body = await request.json();
  const parsed = supplierSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { contacts, ...data } = parsed.data;

  const supplier = await prisma.supplier.create({
    data: {
      name: data.name,
      businessNumber: data.businessNumber || null,
      representative: data.representative || null,
      phone: data.phone || null,
      fax: data.fax || null,
      email: data.email || null,
      address: data.address || null,
      bankName: data.bankName || null,
      bankAccount: data.bankAccount || null,
      bankHolder: data.bankHolder || null,
      paymentMethod: data.paymentMethod,
      paymentTermDays: data.paymentTermDays,
      memo: data.memo || null,
      ...(contacts?.length ? {
        contacts: {
          create: contacts.map((c) => ({
            name: c.name,
            phone: c.phone || null,
            email: c.email || null,
            position: c.position || null,
            memo: c.memo || null,
          })),
        },
      } : {}),
    },
    include: { contacts: true },
  });

  return NextResponse.json(supplier, { status: 201 });
}
