import { SerialDetailClient } from "./_client";

export default async function SerialItemDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <SerialDetailClient code={decodeURIComponent(code)} />;
}
