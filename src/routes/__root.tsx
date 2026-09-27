import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "sonner";
import { SupportChatbot } from "../components/SupportChatbot";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Atelier — Multi-Agent Research Framework" },
      { name: "description", content: "Atelier coordinates five specialised AI agents to read papers, generate citations, surface research gaps, and produce publishable reports." },
      { property: "og:site_name", content: "Atelier" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:title", content: "Atelier — Multi-Agent Research Framework" },
      { name: "twitter:title", content: "Atelier — Multi-Agent Research Framework" },
      { property: "og:description", content: "Atelier coordinates five specialised AI agents to read papers, generate citations, surface research gaps, and produce publishable reports." },
      { name: "twitter:description", content: "Atelier coordinates five specialised AI agents to read papers, generate citations, surface research gaps, and produce publishable reports." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/0c422aac-179d-433b-b6c5-fc58a61f5217/id-preview-4f22a121--313fa586-a2e9-481d-8108-6b6f39f80f93.lovable.app-1782839342917.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/0c422aac-179d-433b-b6c5-fc58a61f5217/id-preview-4f22a121--313fa586-a2e9-481d-8108-6b6f39f80f93.lovable.app-1782839342917.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Atelier",
          url: "https://cozy-connect-73.lovable.app",
          description:
            "Multi-agent research framework that automates literature reviews, citations, gap analysis, methodology recommendation and report generation.",
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Atelier",
          url: "https://cozy-connect-73.lovable.app",
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    let mounted = true;
    import("@/integrations/supabase/client").then(({ supabase }) => {
      if (!mounted) return;
      const sub = supabase.auth.onAuthStateChange((event) => {
        if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
        router.invalidate();
        if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
      });
      (window as any).__authSub = sub;
    });
    return () => { mounted = false; };
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster richColors position="top-right" />
      <SupportChatbot />
    </QueryClientProvider>
  );
}
