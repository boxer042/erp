import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardAdmin } from "@/lib/api-auth";
import { companyInfoSchema } from "@/lib/validators/company-info";

const SINGLETON_ID = "singleton";

export async function GET() {
  const company = await prisma.companyInfo.findUnique({
    where: { id: SINGLETON_ID },
    include: {
      bankAccounts: {
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  return NextResponse.json(company);
}

export async function PUT(request: NextRequest) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;

  const body = await request.json();
  const parsed = companyInfoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const updated = await prisma.companyInfo.upsert({
    where: { id: SINGLETON_ID },
    update: parsed.data,
    create: { id: SINGLETON_ID, ...parsed.data },
    include: {
      bankAccounts: {
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  return NextResponse.json(updated);
}
