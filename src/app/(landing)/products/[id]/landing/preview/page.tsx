import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { landingBlocksSchema } from "@/lib/validators/landing-block";
import { LandingPageView } from "@/components/landing/landing-page-view";

export const dynamic = "force-dynamic";

export default async function LandingPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [product, settings] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      select: { id: true, name: true, sku: true, landingBlocks: true },
    }),
    prisma.landingSettings.findUnique({ where: { id: "singleton" } }),
  ]);
  if (!product) notFound();

  const productParsed = landingBlocksSchema.safeParse(product.landingBlocks ?? []);
  const productBlocks = productParsed.success ? productParsed.data : [];

  const footerParsed = landingBlocksSchema.safeParse(settings?.footerBlocks ?? []);
  const footerBlocks = footerParsed.success ? footerParsed.data : [];

  // 상품 블록 + 공통 footer 블록 합쳐서 렌더 (footer 블록 id 충돌 방지 prefix)
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
