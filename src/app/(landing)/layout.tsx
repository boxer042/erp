import { requireAuth } from "@/lib/auth";

export default async function LandingPreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuth();
  return <div className="min-h-screen bg-background text-foreground">{children}</div>;
}
