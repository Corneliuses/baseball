import { cn } from "@/lib/utils";

export function PageContainer({
  children,
  className,
}: Readonly<{
  children: React.ReactNode;
  className?: string;
}>) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-primary">
            Youth Baseball Team Manager
          </h1>
        </div>
      </header>
      <main className={cn("flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8", className)}>
        {children}
      </main>
    </div>
  );
}
