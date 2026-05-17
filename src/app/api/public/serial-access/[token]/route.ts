import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serialDetailInclude, buildSerialProfile } from "@/lib/serial-profile";
import { logSerialAccess } from "@/lib/serial-access-log";

// GET /api/public/serial-access/[token] — 손님 공개 페이지 1단계 (비인증, 마스킹).
// 토큰만으로 접근 — 손님 개인정보·금액은 가려진 상태. 상세는 verify 2단계에서.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const raw = await prisma.serialItem.findUnique({
    where: { accessToken: token },
    include: serialDetailInclude,
  });
  if (!raw || raw.accessTokenRevokedAt || raw.anonymizedAt) {
    return NextResponse.json({ error: "유효하지 않은 접근입니다" }, { status: 404 });
  }
  if (raw.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "이 제품은 반품·폐기 처리되었습니다", status: raw.status },
      { status: 410 },
    );
  }

  await logSerialAccess({
    serialItemId: raw.id,
    accessToken: token,
    stage: "PAGE_VIEW",
    headers: request.headers,
  });

  const profile = buildSerialProfile(raw, { masked: true });

  // 매장 정보 — 손님 페이지 풋터·문의용 (상호·전화·주소만)
  const companyRaw = await prisma.companyInfo.findUnique({
    where: { id: "singleton" },
    select: { name: true, phone: true, address: true },
  });
  const company = companyRaw
    ? {
        name: companyRaw.name,
        phone: companyRaw.phone,
        address: companyRaw.address,
      }
    : null;

  // 손님 연결이 없으면 본인확인이 불가 — 2단계 없이 마스킹 정보만.
  return NextResponse.json({
    mode: "summary",
    verifiable: raw.customer != null,
    code: profile.code,
    soldAt: profile.soldAt,
    warranty: profile.warranty,
    device: profile.device,
    customer: profile.customer,
    purchase: profile.purchase,
    repairCount: profile.repairs.length,
    repairs: profile.repairs.map((r) => ({
      id: r.id,
      receivedAt: r.receivedAt,
      completedAt: r.completedAt,
      symptom: r.symptom,
      status: r.status,
    })),
    company,
  });
}
