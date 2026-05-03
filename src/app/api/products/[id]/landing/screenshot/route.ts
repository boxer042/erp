import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  }

  const { id } = await params;

  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  const previewUrl = `${baseUrl}/products/${id}/landing/preview`;

  // Width 고객/외부 채널이 보는 표준 폭. ?width=1080 등으로 조절 가능.
  const widthParam = url.searchParams.get("width");
  const viewportWidth = Math.min(Math.max(parseInt(widthParam ?? "1080", 10) || 1080, 320), 2560);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();

    // 인증 쿠키 그대로 전달
    const cookieHeader = request.headers.get("cookie") ?? "";
    const cookies = cookieHeader
      .split(";")
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => {
        const eq = c.indexOf("=");
        const name = c.slice(0, eq).trim();
        const value = c.slice(eq + 1).trim();
        return { name, value, domain: url.hostname, path: "/" };
      });
    if (cookies.length > 0) {
      await page.setCookie(...cookies);
    }

    await page.setViewport({ width: viewportWidth, height: 800, deviceScaleFactor: 2 });
    await page.goto(previewUrl, { waitUntil: "networkidle0", timeout: 45000 });

    // 모션 블록(IntersectionObserver) 진입 트리거 — 천천히 스크롤
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        const distance = 400;
        const delay = 80;
        let scrolled = 0;
        const max = document.body.scrollHeight;
        const step = () => {
          window.scrollBy(0, distance);
          scrolled += distance;
          if (scrolled >= max) {
            window.scrollTo(0, 0);
            setTimeout(resolve, 200);
          } else {
            setTimeout(step, delay);
          }
        };
        step();
      });
    });

    // 트랜지션 끝나길 잠깐 대기
    await new Promise((r) => setTimeout(r, 600));

    const buffer = await page.screenshot({ fullPage: true, type: "png" });

    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="landing-${id}.png"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[landing/screenshot] error", err);
    const message = err instanceof Error ? err.message : "스크린샷 생성 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
