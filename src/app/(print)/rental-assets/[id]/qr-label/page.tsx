import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { RentalLabelClient } from "./rental-label-client";

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

export default async function RentalAssetQrLabelPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const [asset, company] = await Promise.all([
    prisma.rentalAsset.findUnique({ where: { id } }),
    loadOurCompany(),
  ]);
  if (!asset || !asset.accessToken) notFound();

  const url = `${QR_BASE_URL}/r/${asset.accessToken}`;
  const qrDataUrl = await QRCode.toDataURL(url, {
    margin: 0,
    width: 220,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  });

  return (
    <RentalLabelClient
      assetNo={asset.assetNo}
      name={asset.name}
      qrDataUrl={qrDataUrl}
      company={company}
      auto={sp.auto === "1"}
    />
  );
}
