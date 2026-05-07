/**
 * GET /api/channels/[id]/suggest?sku=...&name=...
 *   채널 SKU 에 대해 ERP 상품 매핑 추천 (상위 5개, 점수순).
 *   보류 큐 UI 의 1클릭 매핑 dialog 에서 사용.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { suggestMappings } from "@/lib/channels/suggest";

export async function GET(
  request: NextRequest,
  { params: _params }: { params: Promise<{ id: string }> },
) {
  await _params; // channel 별 매핑 차이는 추후 — 일단 ERP 전체 product 풀 사용
  const { searchParams } = new URL(request.url);
  const sku = searchParams.get("sku");
  const name = searchParams.get("name") ?? undefined;
  if (!sku) {
    return NextResponse.json(
      { error: "sku 쿼리 파라미터가 필요합니다" },
      { status: 400 },
    );
  }
  const suggestions = await suggestMappings(prisma, sku, name);
  return NextResponse.json(suggestions);
}
