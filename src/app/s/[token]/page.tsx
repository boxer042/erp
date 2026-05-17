import type { Metadata } from "next";
import { SerialPublicClient } from "./_client";

export const metadata: Metadata = {
  title: "제품 정보 조회",
  robots: { index: false, follow: false },
};

export default async function SerialPublicPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <SerialPublicClient token={token} />;
}
