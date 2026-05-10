import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import {
  createAutoMappedProductForSupplierProduct,
  reconcileOrphanLotsForMapping,
} from "@/lib/mapping-helpers";

export async function POST() {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const targets = await prisma.supplierProduct.findMany({
    where: { isActive: true, productMappings: { none: {} } },
    select: { id: true, name: true, spec: true, unitOfMeasure: true, listPrice: true },
    orderBy: { createdAt: "asc" },
  });

  if (targets.length === 0) {
    return NextResponse.json({ total: 0, success: 0, failed: 0, errors: [] });
  }

  let success = 0;
  let failed = 0;
  const errors: { id: string; name: string; message: string }[] = [];

  for (const sp of targets) {
    try {
      await prisma.$transaction(
        async (tx) => {
          const { productId } = await createAutoMappedProductForSupplierProduct(tx, sp);
          const mapping = await tx.productMapping.create({
            data: { supplierProductId: sp.id, productId, conversionRate: 1 },
            select: { id: true },
          });
          await reconcileOrphanLotsForMapping(tx, {
            supplierProductId: sp.id,
            productId,
            conversionRate: 1,
            referenceId: mapping.id,
          });
        },
        { timeout: 30000, maxWait: 10000 },
      );
      success++;
    } catch (e) {
      failed++;
      errors.push({
        id: sp.id,
        name: sp.name,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({ total: targets.length, success, failed, errors });
}
