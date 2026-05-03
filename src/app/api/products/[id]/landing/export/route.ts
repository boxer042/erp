import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { landingBlocksSchema } from "@/lib/validators/landing-block";
import { blocksToHtml, blocksToMarkdown } from "@/lib/landing-export";

export const dynamic = "force-dynamic";

/**
 * 외부 채널 (쿠팡/네이버 등) 복붙용 HTML / Markdown export.
 *
 * GET /api/products/[id]/landing/export?format=html
 * GET /api/products/[id]/landing/export?format=md
 *
 * SINGLE_HTML 모드 상품은 export 불가 (HTML 파일 자체를 다운로드 가능).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "html";

  const [product, settings] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        sku: true,
        name: true,
        landingBlocks: true,
        landingMode: true,
        singleHtmlUrl: true,
      },
    }),
    prisma.landingSettings.findUnique({ where: { id: "singleton" } }),
  ]);
  if (!product) {
    return NextResponse.json({ error: "상품을 찾을 수 없습니다" }, { status: 404 });
  }

  if (product.landingMode === "SINGLE_HTML") {
    return NextResponse.json(
      {
        error:
          "단일 HTML 모드 상품은 별도 export 불필요 — 업로드한 HTML 파일을 그대로 사용하세요",
        singleHtmlUrl: product.singleHtmlUrl,
      },
      { status: 400 },
    );
  }

  const productParsed = landingBlocksSchema.safeParse(product.landingBlocks ?? []);
  const productBlocks = productParsed.success ? productParsed.data : [];

  const footerParsed = landingBlocksSchema.safeParse(settings?.footerBlocks ?? []);
  const footerBlocks = footerParsed.success ? footerParsed.data : [];

  const allBlocks = [...productBlocks, ...footerBlocks];

  if (format === "md" || format === "markdown") {
    const md = blocksToMarkdown(allBlocks);
    return new NextResponse(md, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="landing-${product.sku}.md"`,
      },
    });
  }

  // 기본은 HTML
  const inner = blocksToHtml(allBlocks);
  const fullHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>${product.name} 상세페이지</title>
  <style>
    body { margin: 0; font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif; color: #1d1d1f; -webkit-font-smoothing: antialiased; }
    a { color: inherit; }
    img { max-width: 100%; }
  </style>
</head>
<body>
${inner}
</body>
</html>`;

  return new NextResponse(fullHtml, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="landing-${product.sku}.html"`,
    },
  });
}
