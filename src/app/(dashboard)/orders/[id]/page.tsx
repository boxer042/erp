import { redirect } from "next/navigation";

/**
 * /orders/[id] — 상세 sheet 와 중복이라 폐기. 워크보드(`?id=` 쿼리)로 redirect 해서
 * 자동으로 detail sheet 가 열리게 한다. 외부 링크(tax-invoices, sales/history, rentals)
 * 는 그대로 동작.
 */
export default async function OrderDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/orders?id=${encodeURIComponent(id)}`);
}
