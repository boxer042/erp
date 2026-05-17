import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { customerSchema } from "@/lib/validators/customer";
import { guardUser } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";

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
  const [user, deny] = await guardUser();
  if (deny) return deny;
  const body = await request.json();
  const parsed = customerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  // 전화번호 중복 체크 — 같은 phone 으로 활성 고객이 이미 있으면 409 + 기존 정보 반환.
  // 클라이언트가 "기존 고객으로 사용" / "그래도 새로 등록" 선택할 수 있도록 details 제공.
  const normalizedPhone = data.phone.replace(/[^\d]/g, "");
  if (normalizedPhone.length > 0 && !data.allowDuplicatePhone) {
    const existing = await prisma.customer.findFirst({
      where: { isActive: true, phone: { contains: normalizedPhone } },
      select: { id: true, name: true, phone: true, businessNumber: true, type: true },
    });
    if (existing) {
      return NextResponse.json(
        {
          error: "같은 전화번호로 이미 등록된 고객이 있습니다",
          existing,
        },
        { status: 409 },
      );
    }
  }

  // 사업자번호 중복 체크 — BUSINESS 일 때만. 사업자번호는 고유식별자성이 강해 우회 옵션 없이 막음.
  if (data.type === "BUSINESS" && data.businessNumber) {
    const normalizedBN = data.businessNumber.replace(/[^\d]/g, "");
    if (normalizedBN.length === 10) {
      const existing = await prisma.customer.findFirst({
        where: {
          isActive: true,
          businessNumber: { contains: normalizedBN },
        },
        select: { id: true, name: true, phone: true, businessNumber: true, type: true },
      });
      if (existing) {
        return NextResponse.json(
          {
            error: `같은 사업자번호로 이미 등록된 고객이 있습니다 — ${existing.name}`,
            existing,
          },
          { status: 409 },
        );
      }
    }
  }

  // 개인이면 기업 전용 fields 강제 null 처리 (UI 에서 잔재 들어와도 정리)
  const isBusiness = data.type === "BUSINESS";
  const customer = await prisma.customer.create({
    data: {
      type: data.type,
      name: data.name,
      phone: data.phone,
      email: data.email || null,
      memo: data.memo || null,
      businessNumber: isBusiness ? data.businessNumber || null : null,
      ceo: isBusiness ? data.ceo || null : null,
      fax: isBusiness ? data.fax || null : null,
      businessType: isBusiness ? data.businessType || null : null,
      businessItem: isBusiness ? data.businessItem || null : null,
      address: data.address || null,
      shippingAddress: data.shippingAddress || null,
      contactName: isBusiness ? data.contactName || null : null,
      contactPhone: isBusiness ? data.contactPhone || null : null,
      contactPosition: isBusiness ? data.contactPosition || null : null,
      serialServiceConsent: data.serialServiceConsent ?? false,
      consentedAt: data.serialServiceConsent ? new Date() : null,
      consentVersion: data.serialServiceConsent ? "v1.0" : null,
    },
  });

  await recordAudit(prisma, {
    userId: user.id,
    entity: "Customer",
    entityId: customer.id,
    action: "CREATE",
    meta: { name: customer.name, type: customer.type },
  });

  return NextResponse.json(customer, { status: 201 });
}
