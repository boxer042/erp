import { BlockView } from "./landing-blocks";
import type { LandingBlock } from "@/lib/validators/landing-block";

interface LandingPageViewProps {
  blocks: LandingBlock[];
  emptyMessage?: string;
  /** spec-table 등 상품 데이터를 자동 참조하는 블록을 위해 전달 */
  productId?: string;
}

export function LandingPageView({
  blocks,
  emptyMessage = "상세페이지가 비어 있습니다",
  productId,
}: LandingPageViewProps) {
  if (blocks.length === 0) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }
  return (
    <div className="flex w-full flex-col">
      {blocks.map((block) => (
        <BlockView key={block.id} block={block} productId={productId} />
      ))}
    </div>
  );
}
