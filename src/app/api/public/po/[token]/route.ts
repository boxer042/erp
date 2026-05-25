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
              priceUndetermined: true,
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
    // 우리가 PO 발송 시 사전 선택한 출고 방법 (보통 PICKUP 또는 null).
    // PICKUP 이면 거래처 모달에서 출고 방법 선택을 숨기고 출고 가능일만 입력.
    shippingMethod: po.shippingMethod ?? null,
    promisedDate: po.promisedDate?.toISOString() ?? null,
    shippingMemo: po.shippingMemo ?? null,
    // 가격 미정 단가를 거래처가 입력했을 때 우리쪽 확인이 필요한지 (UI 라벨에서 사용)
    requirePriceReview: po.requirePriceReview,
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
      // 가격 미정 — true 면 외부 페이지에서 ₩0 대신 "가격 미정" 표시 + 수락 버튼 차단
      priceUndetermined: it.priceUndetermined,
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
