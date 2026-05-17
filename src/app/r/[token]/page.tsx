import type { Metadata } from "next";
import { RentalAssetClient } from "./_client";

export const metadata: Metadata = {
  title: "임대 제품 사용설명서",
  robots: { index: false, follow: false },
};

export default async function RentalAssetPublicPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <RentalAssetClient token={token} />;
}
