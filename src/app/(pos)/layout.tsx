import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { PosNav } from "@/components/pos/pos-nav";
import { SessionsProvider } from "@/components/pos/sessions-context";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function PosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuth();

  return (
    <SessionsProvider>
      <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
        <header className="flex h-14 shrink-0 items-center border-b border-border bg-background px-5">
          <Link
            href="/pos"
            className="flex items-center gap-2 text-base font-semibold tracking-tight"
          >
            <span className="inline-block h-5 w-1 rounded-full bg-primary" />
            <span>POS</span>
          </Link>

          <div className="ml-8 flex-1">
            <PosNav />
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            >
              ERP로
            </Link>
            <ThemeToggle />
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-full bg-brand-muted text-[13px] font-medium text-primary/80">
                {user.name.charAt(0)}
              </div>
              <span className="text-sm text-foreground">{user.name}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </SessionsProvider>
  );
}
