import { useState } from "react";
import { type ErrorComponentProps, useRouter } from "@tanstack/react-router";
import { Icon, Button } from "@/components/trip/ui";
import { useNetworkStatus } from "@/lib/network";
import { NoInternetScreen } from "./NoInternetScreen";

export function AppErrorPage({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const { isOnline } = useNetworkStatus();
  const [showDetails, setShowDetails] = useState(false);

  // If error happened while offline, surface the dedicated NoInternetScreen
  if (!isOnline) {
    return (
      <div className="min-h-screen bg-background">
        <NoInternetScreen
          onRetry={() => {
            router.invalidate();
            reset();
          }}
        />
      </div>
    );
  }

  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorName = error instanceof Error ? error.name : "UnexpectedError";

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-12 text-center transition-colors duration-200">
      {/* Top Safe Area Buffer */}
      <div className="w-full h-8 pt-[env(safe-area-inset-top,0px)]" aria-hidden="true" />

      {/* Warning Pitstop Graphic */}
      <div className="relative mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-caution/15 text-caution dark:bg-yellow-950/40 dark:text-yellow-400">
        <Icon name="warning" className="text-[44px]" />
      </div>

      <div className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 font-mono text-[12px] font-semibold text-muted-foreground border border-border/70 mb-3">
        <span className="h-2 w-2 rounded-full bg-caution animate-pulse" />
        SYSTEM RECOVERY
      </div>

      <h1 className="text-[24px] sm:text-[30px] font-bold tracking-tight text-foreground">
        Convoy Pitstop Needed
      </h1>
      <p className="mt-2.5 max-w-md text-[14px] sm:text-[15px] text-muted-foreground leading-relaxed">
        Something unexpected happened while rendering this page. Your convoy session, vehicle colors, and preferences remain safe.
      </p>

      {/* Action Buttons */}
      <div className="mt-6 flex flex-col sm:flex-row items-center gap-3 w-full max-w-sm">
        <Button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="w-full cursor-pointer"
          size="lg"
        >
          <Icon name="refresh" />
          Reload & Try Again
        </Button>
        <a href="/" className="w-full">
          <Button variant="secondary" className="w-full cursor-pointer" size="lg">
            <Icon name="home" />
            Back to Home Base
          </Button>
        </a>
      </div>

      {/* Collapsible Error Diagnosis */}
      <div className="mt-8 w-full max-w-md text-left">
        <button
          type="button"
          onClick={() => setShowDetails(!showDetails)}
          className="mx-auto flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <Icon name={showDetails ? "expand_less" : "expand_more"} className="text-[16px]" />
          <span>{showDetails ? "Hide technical diagnostics" : "Show technical diagnostics"}</span>
        </button>

        {showDetails && (
          <div className="mt-3 rounded-xl border border-border bg-card p-3.5 text-[12px] font-mono shadow-xs overflow-x-auto text-foreground/80">
            <div className="font-semibold text-destructive">{errorName}</div>
            <div className="mt-1 text-muted-foreground break-all">{errorMessage}</div>
          </div>
        )}
      </div>
    </div>
  );
}
