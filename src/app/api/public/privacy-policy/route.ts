import { NextResponse } from "next/server";
import { getCurrentPolicy } from "@/lib/privacy-policy";

// GET /api/public/privacy-policy — 손님 공개용 약관 조회 (비인증).
export async function GET() {
  const policy = await getCurrentPolicy();
  return NextResponse.json({
    id: policy.id,
    content: policy.content,
    publishedAt: policy.publishedAt,
  });
}
