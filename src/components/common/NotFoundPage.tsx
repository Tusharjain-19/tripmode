import { Icon, Button } from "@/components/trip/ui";
import { Link } from "@tanstack/react-router";

export function NotFoundPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-12 text-center transition-colors duration-200">
      {/* Top Safe Area Buffer */}
      <div className="w-full h-8 pt-[env(safe-area-inset-top,0px)]" aria-hidden="true" />

      {/* Off Route Graphic */}
      <div className="relative mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-secondary border border-border shadow-inner">
        <Icon name="wrong_location" className="text-[44px] text-tertiary" />
        <span className="absolute -top-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-destructive text-white text-[12px] font-mono font-bold shadow-xs">
          404
        </span>
      </div>

      <div className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 font-mono text-[12px] font-semibold text-muted-foreground border border-border/70 mb-3">
        <span className="h-2 w-2 rounded-full bg-tertiary" />
        OFF ROUTE
      </div>

      <h1 className="text-[26px] sm:text-[32px] font-bold tracking-tight text-foreground">
        Destination Not Found
      </h1>
      <p className="mt-2.5 max-w-md text-[14px] sm:text-[15px] text-muted-foreground leading-relaxed">
        We couldn't find this checkpoint on our convoy map. The link may have expired, or this road doesn't exist.
      </p>

      {/* Suggested Routes / Actions */}
      <div className="mt-8 flex flex-col sm:flex-row items-center gap-3 w-full max-w-sm">
        <Link to="/" className="w-full">
          <Button className="w-full cursor-pointer" size="lg">
            <Icon name="home" />
            Return to Home Base
          </Button>
        </Link>
        <Link to="/create" className="w-full">
          <Button variant="secondary" className="w-full cursor-pointer" size="lg">
            <Icon name="add_road" />
            Start a Convoy
          </Button>
        </Link>
      </div>

      <div className="mt-8 text-[12px] text-muted-foreground">
        Need to join an existing convoy?{" "}
        <Link to="/" className="font-semibold text-primary underline underline-offset-2 hover:opacity-80">
          Enter invite code on home screen
        </Link>
      </div>
    </div>
  );
}
