import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * 거래처가 토큰으로 발주서 조회 — 인증 우회 (middleware 에서 /api/public/* 허용).
 *
 * 보안:
 * - 토큰으로 row 조회, 없으면 404
 * - 만료/REVOKED/REJECTED 는 410 Gone
 * - ACCEPTED 는 정보는 보여주되 "이미 수락됨" 플래그 추가
 * - viewCount 증가 + IP/UA 기록
 *
 * 응답: 거래처에 보여줄 최소 정보만 (내부 메모/회계 데이터 제외)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const accessToken = await prisma.purchaseOrderAccessToken.findUnique({
    where: { token },
    include: {
      purchaseOrder: {
        include: {
          supplier: { select: { name: true, businessNumber: true, representative: true } },
          items: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              name: true,
              quantity: true,
              unitPrice: true,
              totalPrice: true,
              proposedUnitPrice: true,
              proposalStatus: true,
              proposalRespondedAt: true,
              proposalRejectionNote: true,
              supplierProduct: {
                select: { name: true, spec: true, unitOfMeasure: true, supplierCode: true },
              },
            },
          },
        },
      },
    },
  });

  if (!accessToken) {
    return NextResponse.json({ error: "유효하지 않은 링크입니다" }, { status: 404 });
  }

  // 만료 검사
  const isExpired = accessToken.expiresAt < new Date();
  if (isExpired && accessToken.status !== "EXPIRED") {
    await prisma.purchaseOrderAccessToken.update({
      where: { id: accessToken.id },
      data: { status: "EXPIRED" },
    });
  }

  // 사용 불가 상태
  const dead: string[] = ["EXPIRED", "REVOKED", "REJECTED"];
  if (isExpired || dead.includes(accessToken.status)) {
    return NextResponse.json(
      { error: "만료되었거나 사용할 수 없는 링크입니다", status: isExpired ? "EXPIRED" : accessToken.status },
      { status: 410 }
    );
  }

  // viewCount 갱신 + ACTIVE → VIEWED 전환
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null;
  const ua = request.headers.get("user-agent") || null;
  const now = new Date();
  await prisma.purchaseOrderAccessToken.update({
    where: { id: accessToken.id },
    data: {
      status: accessToken.status === "ACCEPTED" ? "ACCEPTED" : "VIEWED",
      viewCount: { increment: 1 },
      firstViewedAt: accessToken.firstViewedAt ?? now,
      lastViewedAt: now,
      viewerIp: ip,
      viewerUserAgent: ua,
    },
  });

  // 발주를 보낸 우리 회사 정보 (거래처가 봐야 할 발주자 정보)
  const company = await prisma.companyInfo.findUnique({
    where: { id: "singleton" },
    select: {
      name: true,
      businessNumber: true,
      ceo: true,
      phone: true,
      email: true,
      address: true,
      businessType: true,
      businessItem: true,
    },
  });

  // 응답 — 내부 메모/회계 정보 제외, 거래처가 봐야 할 정보만
  const po = accessToken.purchaseOrder;
  return NextResponse.json({
    poNo: po.poNo,
    orderDate: po.orderDate.toISOString(),
    expectedDate: po.expectedDate?.toISOString() ?? null,
    totalAmount: po.totalAmount.toString(),
    // 발주자 (우리)
    issuer: company
      ? {
          name: company.name,
          businessNumber: company.businessNumber,
          ceo: company.ceo,
          phone: company.phone,
          email: company.email,
          address: company.address,
          businessType: company.businessType,
          businessItem: company.businessItem,
        }
      : null,
    // 수신자 (거래처)
    supplier: {
      name: po.supplier.name,
      businessNumber: po.supplier.businessNumber,
      representative: po.supplier.representative,
    },
    items: po.items.map((it) => ({
      id: it.id,
      // 자유입력 라인이면 it.name, 아니면 supplierProduct.name 폴백
      name: it.supplierProduct?.name ?? it.name ?? "",
      spec: it.supplierProduct?.spec ?? null,
      supplierCode: it.supplierProduct?.supplierCode ?? null,
      unitOfMeasure: it.supplierProduct?.unitOfMeasure ?? "EA",
      quantity: it.quantity.toString(),
      unitPrice: it.unitPrice.toString(),
      totalPrice: it.totalPrice.toString(),
      proposedUnitPrice: it.proposedUnitPrice?.toString() ?? null,
      proposalStatus: it.proposalStatus,
      proposalRespondedAt: it.proposalRespondedAt?.toISOString() ?? null,
      proposalRejectionNote: it.proposalRejectionNote,
    })),
    poStatus: po.status,
    tokenStatus: accessToken.status,
    alreadyAccepted: accessToken.status === "ACCEPTED",
    acceptedAt: accessToken.acceptedAt?.toISOString() ?? null,
    expiresAt: accessToken.expiresAt.toISOString(),
  });
}
