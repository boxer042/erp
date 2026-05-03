import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { landingBlocksSchema } from "@/lib/validators/landing-block";
import { LandingPageView } from "@/components/landing/landing-page-view";
import { SingleHtmlPreview } from "@/components/landing/single-html-preview";

export const dynamic = "force-dynamic";

function resolveHtmlSrc(url: string): string {
  const m = url.match(/\/storage\/v1\/object\/public\/product-html\/(.+)$/);
  if (m) return `/api/products/landing-html/${m[1]}`;
  return url;
}

export default async function LandingPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [product, settings] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        sku: true,
        landingBlocks: true,
        landingMode: true,
        singleHtmlUrl: true,
      },
    }),
    prisma.landingSettings.findUnique({ where: { id: "singleton" } }),
  ]);
  if (!product) notFound();

  // SINGLE_HTML 모드: 업로드된 HTML 파일 1개만 통째로 풀스크린 (footer 미적용)
  if (product.landingMode === "SINGLE_HTML") {
    if (!product.singleHtmlUrl) {
      return (
        <main className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
          HTML 파일이 아직 업로드되지 않았습니다
        </main>
      );
    }
    return (
      <main className="w-full">
        <SingleHtmlPreview src={resolveHtmlSrc(product.singleHtmlUrl)} />
      </main>
    );
  }

  // BLOCKS 모드: 기존 동작 (블록 + 공통 footer)
  const productParsed = landingBlocksSchema.safeParse(product.landingBlocks ?? []);
  const productBlocks = productParsed.success ? productParsed.data : [];

  const footerParsed = landingBlocksSchema.safeParse(settings?.footerBlocks ?? []);
  const footerBlocks = footerParsed.success ? footerParsed.data : [];

  const blocks = [
    ...productBlocks,
    ...footerBlocks.map((b) => ({ ...b, id: `__footer__${b.id}` })),
  ];

  return (
    <main className="mx-auto w-full max-w-[1200px]">
      <LandingPageView blocks={blocks} emptyMessage="아직 등록된 상세페이지가 없습니다" productId={id} />
    </main>
  );
}
