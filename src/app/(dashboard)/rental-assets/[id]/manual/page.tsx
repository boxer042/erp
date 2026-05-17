import { ManualEditor } from "@/components/manual-editor";
import { queryKeys } from "@/lib/query-keys";

export default async function RentalAssetManualPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <ManualEditor
      apiPath={`/api/rental-assets/${id}/manual`}
      queryKey={queryKeys.rentalAssets.manual(id)}
      backHref="/rental-assets"
    />
  );
}
