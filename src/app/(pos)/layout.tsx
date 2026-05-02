import { requireAuth } from "@/lib/auth";
import { SessionsProvider } from "@/components/pos/sessions-context";
import { PosShell } from "@/components/pos/pos-shell";

export default async function PosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuth();

  return (
    <SessionsProvider>
      <PosShell>{children}</PosShell>
    </SessionsProvider>
  );
}
