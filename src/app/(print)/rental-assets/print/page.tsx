import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { LabelClient } from "./label-client";

const QR_BASE_URL = process.env.NEXT_PUBLIC_QR_BASE_URL ?? "https://example.com";

async function loadOurCompany() {
  const company = await prisma.companyInfo.findUnique({
    where: { id: "singleton" },
  });
  return {
    name: company?.name || "우리 상호",
    phone: company?.phone ?? null,
  };
}

/**
 * 임대 자산 라벨 인쇄 — Brother QL 62mm × 35mm 라벨.
 * 자산번호 = 라벨 코드. QR 은 `{QR_BASE_URL}/ra/{assetNo}` 로 매장 직원이 스캔 시 자산 상세로 이동.
 *
 * 쿼리:
 *  - codes: 콤마구분 자산번호 리스트 (예: ?codes=RA-260515-0001,RA-260515-0002)
 *  - auto=1: 마운트 후 자동 인쇄 다이얼로그 호출 (목록의 [라벨 인쇄] 버튼 UX)
 */
export default async function RentalAssetsPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ codes?: string; auto?: string }>;
}) {
  const sp = await searchParams;
  const codes = (sp.codes ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (codes.length === 0) notFound();

  const [assets, company] = await Promise.all([
    prisma.rentalAsset.findMany({
      where: { assetNo: { in: codes } },
      select: {
        assetNo: true,
        name: true,
        brand: true,
        modelNo: true,
      },
    }),
    loadOurCompany(),
  ]);

  // 쿼리 순서대로 정렬 (UI 에서 선택한 순서 유지)
  const byCode = new Map(assets.map((a) => [a.assetNo, a]));
  const ordered = codes
    .map((c) => byCode.get(c))
    .filter((x): x is NonNullable<typeof x> => !!x);

  const labels = await Promise.all(
    ordered.map(async (a) => {
      const url = `${QR_BASE_URL}/ra/${a.assetNo}`;
      const qrDataUrl = await QRCode.toDataURL(url, {
        margin: 0,
        width: 220,
        errorCorrectionLevel: "M",
        color: { dark: "#000000", light: "#ffffff" },
      });
      return {
        code: a.assetNo,
        name: a.name,
        brand: a.brand,
        modelNo: a.modelNo,
        qrDataUrl,
        qrUrl: url,
      };
    }),
  );

  return <LabelClient labels={labels} company={company} auto={sp.auto === "1"} />;
}
