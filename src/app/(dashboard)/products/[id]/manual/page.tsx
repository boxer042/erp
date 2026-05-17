import { ManualEditor } from "@/components/manual-editor";
import { queryKeys } from "@/lib/query-keys";

export default async function ProductManualPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <ManualEditor
      apiPath={`/api/products/${id}/manual`}
      queryKey={queryKeys.products.manual(id)}
      backHref={`/products/${id}`}
    />
  );
}
