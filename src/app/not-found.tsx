import Link from "next/link";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";

/// Root-level boundary, deliberately not nested under /t/[teamId]/.
///
/// A layout is the outermost component in its own route segment — it wraps
/// that segment's own not-found.tsx, not the other way around
/// (node_modules/next/dist/docs/.../file-conventions/layout.md:24). So a
/// notFound() thrown by /t/[teamId]/layout.tsx's own access check — the most
/// common case, a signed-in caller with no membership on this team — never
/// reaches a not-found.tsx placed inside that same [teamId] segment; it
/// bubbles to the nearest ancestor boundary instead. Putting the boundary
/// here, above /t, catches that case correctly along with everything else.
///
/// The copy is intentionally generic per Decision 7: it must not confirm or
/// deny whether a given teamId exists to someone who isn't a member of it.
export default function NotFound() {
  return (
    <PageContainer>
      <div className="mx-auto max-w-md text-center py-12">
        <h2 className="text-2xl font-bold text-foreground mb-2">
          Page not found
        </h2>
        <p className="text-muted-foreground mb-6">
          That page doesn&apos;t exist, or you don&apos;t have access to it.
        </p>
        <Button asChild>
          <Link href="/">Back home</Link>
        </Button>
      </div>
    </PageContainer>
  );
}
