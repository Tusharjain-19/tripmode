import { useNetworkStatus } from "@/lib/network";
import { Icon, Button } from "@/components/trip/ui";
import { Link } from "@tanstack/react-router";

export function NoInternetScreen({ onRetry }: { onRetry?: () => void }) {
  const { isChecking, checkConnection } = useNetworkStatus();

  const handleRetry = async () => {
    const online = await checkConnection();
    if (online && onRetry) {
      onRetry();
    }
  };

  return (
    <div className="flex min-h-[85vh] flex-col items-center justify-center px-4 py-8 text-center">
      {/* Animated Radar Signal Off Graphic */}
      <div className="relative mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-destructive/10 text-destructive dark:bg-red-950/40 dark:text-red-400">
        <span className="absolute inset-0 rounded-full border border-destructive/20 animate-ping opacity-40" />
        <Icon name="signal_wifi_off" className="text-[44px]" />
      </div>

      <div className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 font-mono text-[12px] font-semibold text-muted-foreground border border-border/60 mb-3">
        <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
        OFFLINE MODE
      </div>

      <h1 className="text-[24px] sm:text-[28px] font-bold tracking-tight text-foreground">
        No Internet Connection
      </h1>
      <p className="mt-2.5 max-w-md text-[14px] sm:text-[15px] text-muted-foreground leading-relaxed">
        Trip Mode needs a cellular or Wi-Fi connection to synchronize live convoy vehicles, voice coordination, and hazard reports.
      </p>

      {/* Helpful Driver Tips */}
      <div className="mt-6 w-full max-w-sm rounded-[18px] border border-border bg-card p-4 text-left shadow-xs">
        <div className="text-[12px] font-semibold uppercase tracking-wider text-tertiary mb-2.5">
          Driver Diagnostics
        </div>
        <ul className="space-y-2 text-[13px] text-foreground/90">
          <li className="flex items-start gap-2">
            <Icon name="check_circle" className="text-leading text-[16px] shrink-0 mt-0.5" />
            <span>Local GPS speedometer continues working.</span>
          </li>
          <li className="flex items-start gap-2">
            <Icon name="check_circle" className="text-leading text-[16px] shrink-0 mt-0.5" />
            <span>Cached route corridors remain visible on map.</span>
          </li>
          <li className="flex items-start gap-2">
            <Icon name="sync" className="text-primary text-[16px] shrink-0 mt-0.5" />
            <span>Vehicles will auto-reconnect as soon as signal returns.</span>
          </li>
        </ul>
      </div>

      {/* Action Buttons */}
      <div className="mt-6 flex flex-col sm:flex-row items-center gap-3 w-full max-w-sm">
        <Button
          onClick={() => void handleRetry()}
          disabled={isChecking}
          className="w-full cursor-pointer"
          size="lg"
        >
          <Icon name="refresh" className={isChecking ? "animate-spin" : ""} />
          {isChecking ? "Checking Connection..." : "Retry Connection"}
        </Button>
        <Link to="/" className="w-full">
          <Button variant="secondary" className="w-full cursor-pointer" size="lg">
            <Icon name="home" />
            Back to Home
          </Button>
        </Link>
      </div>
    </div>
  );
}
