import { useNetworkStatus } from "@/lib/network";
import { Icon } from "@/components/trip/ui";
import { cn } from "@/lib/utils";

export function OfflineBanner() {
  const { isOnline, isChecking, wasOffline, checkConnection } = useNetworkStatus();

  // If online and wasn't recently offline, don't show anything
  if (isOnline && !wasOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed top-0 inset-x-0 z-[100] transition-all duration-300 ease-out px-3 py-2 text-center text-[13px] font-medium shadow-md flex items-center justify-center gap-2",
        isOnline
          ? "bg-leading text-white"
          : "bg-destructive text-destructive-foreground dark:bg-red-950 dark:text-red-200 border-b border-red-800/40",
      )}
    >
      <Icon
        name={isOnline ? "wifi" : "wifi_off"}
        className={cn("text-[17px] shrink-0", !isOnline && "animate-pulse")}
      />
      <span className="truncate">
        {isOnline
          ? "Connection restored • Live convoy syncing active"
          : "No internet connection • Convoy sync paused until reconnected"}
      </span>

      {!isOnline && (
        <button
          type="button"
          onClick={() => void checkConnection()}
          disabled={isChecking}
          className="ml-2 inline-flex items-center gap-1 rounded-full bg-black/20 hover:bg-black/30 px-2.5 py-0.5 text-[11px] font-semibold text-white transition-colors cursor-pointer shrink-0 disabled:opacity-50"
        >
          {isChecking ? (
            <>
              <Icon name="sync" className="animate-spin text-[12px]" />
              Checking...
            </>
          ) : (
            <>
              <Icon name="refresh" className="text-[12px]" />
              Retry
            </>
          )}
        </button>
      )}
    </div>
  );
}
