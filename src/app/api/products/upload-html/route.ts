import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { normalizeHtmlBytes } from "@/lib/html-utils";

const BUCKET = "product-html";
const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME = ["text/html"];

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "파일이 5MB를 초과합니다" }, { status: 400 });
  }
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (ext !== "html" && ext !== "htm") {
    return NextResponse.json({ error: ".html / .htm 파일만 지원합니다" }, { status: 400 });
  }
  if (file.type && !ALLOWED_MIME.includes(file.type)) {
    return NextResponse.json({ error: "HTML 파일만 지원합니다" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return NextResponse.json({ error: "세션 인증 실패" }, { status: 401 });

  const uuid = crypto.randomUUID();
  const path = `${authUser.id}/${uuid}.html`;

  // 인코딩 자동 변환 + meta charset 보장 + UTF-8 로 재인코딩
  const arrayBuffer = await file.arrayBuffer();
  const utf8Bytes = normalizeHtmlBytes(new Uint8Array(arrayBuffer));

  const { error } = await supabase.storage.from(BUCKET).upload(path, utf8Bytes, {
    contentType: "text/html; charset=utf-8",
    upsert: false,
  });
  if (error) {
    console.error("[products/upload-html] supabase upload error", error);
    const msg = error.message?.includes("Bucket not found")
      ? `Supabase 에 '${BUCKET}' public 버킷을 먼저 생성해야 합니다`
      : "업로드에 실패했습니다";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // 프록시 URL 반환 — 같은 origin 으로 서빙되며 Content-Type 강제 보장
  return NextResponse.json({
    url: `/api/products/landing-html/${path}`,
    path,
    name: file.name,
  });
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { path } = (await request.json()) as { path: string };
  if (!path) return NextResponse.json({ error: "path 누락" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return NextResponse.json({ error: "세션 인증 실패" }, { status: 401 });

  if (!path.startsWith(`${authUser.id}/`)) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) {
    console.error("[products/upload-html] supabase delete error", error);
    return NextResponse.json({ error: "삭제에 실패했습니다" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
