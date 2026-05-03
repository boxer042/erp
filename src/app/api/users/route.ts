import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";

export async function GET() {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(users);
}
