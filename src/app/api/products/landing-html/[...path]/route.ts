import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { normalizeHtmlBytes } from "@/lib/html-utils";

const BUCKET = "product-html";

/**
 * 업로드된 HTML 파일을 우리 origin 으로 프록시 서빙.
 * 목적: Supabase 의 Content-Type 추론 변동성을 우회하고 항상
 * `text/html; charset=utf-8` 으로 응답 → iframe 이 코드가 아닌 렌더링된 페이지로 표시.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  }

  const { path: pathParts } = await params;
  const storagePath = pathParts.join("/");
  if (!storagePath || storagePath.includes("..")) {
    return NextResponse.json({ error: "잘못된 경로" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error || !data) {
    console.error("[landing-html proxy] download error", error);
    return new NextResponse("Not Found", { status: 404 });
  }

  // 이전에 업로드된 EUC-KR/CP949 등 다른 인코딩 파일도 자동으로 UTF-8 로 변환해 서빙
  const rawBytes = new Uint8Array(await data.arrayBuffer());
  const utf8Bytes = normalizeHtmlBytes(rawBytes);
  return new NextResponse(utf8Bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
