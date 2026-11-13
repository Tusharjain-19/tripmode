import { AnnouncementBar } from "@/components/trip/AnnouncementBar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportAppError } from "../lib/error-reporting";
import { NotFoundPage } from "@/components/common/NotFoundPage";
import { AppErrorPage } from "@/components/common/AppErrorPage";

function RootNotFound() {
  return (
    <RootDocument>
      <NotFoundPage />
    </RootDocument>
  );
}

function RootError(props: ErrorComponentProps) {
  useEffect(() => {
    reportAppError(props.error, { boundary: "tanstack_root_error_component" });
  }, [props.error]);

  return (
    <RootDocument>
      <AppErrorPage {...props} />
    </RootDocument>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
      },
      { name: "theme-color", content: "#f7f5f0", media: "(prefers-color-scheme: light)" },
      { name: "theme-color", content: "#000000", media: "(prefers-color-scheme: dark)" },
      { title: "Trip Mode" },
      {
        name: "description",
        content: "Travel together in separate vehicles on one shared live map.",
      },
      { property: "og:title", content: "Trip Mode" },
      {
        property: "og:description",
        content: "Travel together in separate vehicles on one shared live map.",
      },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "https://tripmode-orcin.vercel.app/og-image.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:alt", content: "Trip Mode - Live Road Trip Convoy Navigation" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://tripmode-orcin.vercel.app/og-image.png" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "preconnect", href: "https://tiles.openfreemap.org" },
      { rel: "dns-prefetch", href: "https://tiles.openfreemap.org" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500&family=Noto+Sans+Devanagari:wght@400;500;600&family=Public+Sans:wght@400;500;600&family=Material+Symbols+Rounded:opsz,wght@24,500&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "alternate icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  component: RootComponent,
  notFoundComponent: RootNotFound,
  errorComponent: RootError,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <RootDocument>
      <QueryClientProvider client={queryClient}>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <AnnouncementBar />
        <Outlet />
      </QueryClientProvider>
    </RootDocument>
  );
}
