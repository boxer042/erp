import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { LabelClient, type LabelSize } from "./label-client";

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

const VALID_SIZES: LabelSize[] = ["small", "standard", "large"];

export default async function SerialItemsPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ codes?: string; auto?: string; size?: string }>;
}) {
  const sp = await searchParams;
  const codes = (sp.codes ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (codes.length === 0) notFound();

  const size: LabelSize = VALID_SIZES.includes(sp.size as LabelSize)
    ? (sp.size as LabelSize)
    : "standard";

  const [items, company] = await Promise.all([
    prisma.serialItem.findMany({
      where: { code: { in: codes } },
      include: {
        product: { select: { name: true } },
      },
    }),
    loadOurCompany(),
  ]);

  // ?codes 순서대로 정렬
  const byCode = new Map(items.map((i) => [i.code, i]));
  const ordered = codes.map((c) => byCode.get(c)).filter((x): x is NonNullable<typeof x> => !!x);

  // 각 라벨에 박힐 QR 데이터 URL을 서버에서 미리 생성.
  // QR 은 추측 불가능한 accessToken 기반 — 토큰이 없거나 revoke 됐으면 QR 생략.
  const labels = await Promise.all(
    ordered.map(async (it) => {
      const hasToken = !!it.accessToken && !it.accessTokenRevokedAt;
      const url = hasToken ? `${QR_BASE_URL}/s/${it.accessToken}` : null;
      const qrDataUrl = url
        ? await QRCode.toDataURL(url, {
            margin: 0,
            width: 220,
            errorCorrectionLevel: "M",
            color: { dark: "#000000", light: "#ffffff" },
          })
        : null;
      // 표시명 우선순위: product.name > displayName > "(미상)"
      const productName = it.product?.name ?? it.displayName ?? "(미상)";
      return {
        code: it.code,
        productName,
        source: it.source,
        soldAt: it.soldAt.toISOString().slice(0, 10),
        warrantyEnds: it.warrantyEnds ? it.warrantyEnds.toISOString().slice(0, 10) : null,
        qrDataUrl,
        qrUrl: url,
      };
    })
  );

  return (
    <LabelClient
      labels={labels}
      company={company}
      auto={sp.auto === "1"}
      size={size}
    />
  );
}
