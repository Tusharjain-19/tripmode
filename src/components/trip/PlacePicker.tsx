import { lazyRetry } from "@/lib/lazy-retry";
import { ClientOnly } from "@tanstack/react-router";
import { Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PLACES, reversePlace, searchPlaces, type LngLat, type Place } from "@/lib/geo";
import { cn } from "@/lib/utils";
import { Button, Icon } from "./ui";

const MapPicker = lazyRetry(() => import("./MapPickerInner"), "map-picker");

const QUICK_CITIES = PLACES.slice(0, 6);

/** Search any place in India, use current location, tap a point on the map, or pick popular presets. */
export function PlacePicker({
  label,
  value,
  onChange,
  allowMyLocation,
}: {
  label: string;
  value: Place | null;
  onChange: (p: Place) => void;
  allowMyLocation?: boolean;
}) {
  const [q, setQ] = useState(value?.name ?? "");
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapPoint, setMapPoint] = useState<LngLat | null>(null);
  const [mapPlace, setMapPlace] = useState<Place | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQ(value?.name ?? "");
  }, [value]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleDocClick);
    return () => document.removeEventListener("mousedown", handleDocClick);
  }, []);

  useEffect(() => {
    if (!open) {
      setResults([]);
      return;
    }
    const clean = q.trim();
    if (clean.length < 2 || clean === value?.name) {
      setResults(PLACES.filter((p) => p.name !== value?.name).slice(0, 5));
      return;
    }

    const ac = new AbortController();
    const t = setTimeout(() => {
      setBusy(true);
      setErr(null);
      searchPlaces(clean, ac.signal)
        .then((res) => {
          setResults(res.length ? res : PLACES.slice(0, 4));
        })
        .catch((e: Error) => {
          if (e.name !== "AbortError") {
            // Graceful fallback to local matches
            const local = PLACES.filter((p) => p.name.toLowerCase().includes(clean.toLowerCase()));
            setResults(local.length ? local : PLACES.slice(0, 3));
          }
        })
        .finally(() => setBusy(false));
    }, 200);

    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [q, open, value?.name]);

  const choose = (p: Place) => {
    onChange(p);
    setQ(p.name);
    setOpen(false);
    setResults([]);
    setErr(null);
  };

  const useMine = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return setErr("This browser cannot share location.");
    }
    setBusy(true);
    setErr(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const p = await reversePlace([pos.coords.longitude, pos.coords.latitude]);
        setBusy(false);
        choose({ ...p, detail: "Current location" });
      },
      () => {
        setBusy(false);
        setErr("Location permission was denied.");
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const pickOnMap = async (p: LngLat) => {
    setMapPoint(p);
    setMapPlace(null);
    setMapPlace(await reversePlace(p));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (results.length > 0) {
        choose(results[0]!);
      } else if (q.trim()) {
        const match = PLACES.find((p) => p.name.toLowerCase() === q.trim().toLowerCase());
        if (match) {
          choose(match);
        } else {
          choose({ name: q.trim(), detail: "Selected place", lngLat: PLACES[0]!.lngLat });
        }
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <label className="block">
        <span className="mb-1.5 block text-[14px] font-medium text-foreground">{label}</span>
        <span className="flex h-12 items-center gap-2 rounded-xl border border-border bg-secondary/80 px-3 transition-colors focus-within:border-primary focus-within:bg-secondary">
          <Icon name="search" className="text-primary text-[20px]" />
          <input
            className="h-full flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
            placeholder="Search city or tap quick options below..."
            value={q}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
          />
          {busy && <Icon name="sync" className="animate-spin text-tertiary text-[18px]" />}
          {value && (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-leading/15 text-leading text-[12px] font-bold">
              ✓
            </span>
          )}
        </span>
      </label>

      {/* Quick City Presets */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mr-1">
          Quick:
        </span>
        {QUICK_CITIES.map((city) => (
          <button
            key={city.name}
            type="button"
            onClick={() => choose(city)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-[12px] font-medium transition-colors cursor-pointer",
              value?.name === city.name
                ? "border-primary bg-primary text-primary-foreground font-semibold"
                : "border-border bg-card hover:bg-secondary text-foreground",
            )}
          >
            {city.name}
          </button>
        ))}
      </div>

      <div className="mt-2 flex gap-2">
        {allowMyLocation && (
          <button
            type="button"
            onClick={useMine}
            className="flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-[13px] font-medium hover:bg-secondary cursor-pointer"
          >
            <Icon name="my_location" className="text-[16px] text-primary" /> My location
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setMapPoint(value?.lngLat ?? null);
            setMapPlace(value);
            setMapOpen(true);
          }}
          className="flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-[13px] font-medium hover:bg-secondary cursor-pointer"
        >
          <Icon name="map" className="text-[16px] text-primary" /> Pick on map
        </button>
      </div>

      {err && (
        <p role="alert" className="mt-1 text-[13px] text-alert">
          {err}
        </p>
      )}

      {/* Dropdown Auto-complete */}
      {open && results.length > 0 && (
        <ul
          role="listbox"
          className="absolute inset-x-0 top-[76px] z-50 max-h-64 overflow-auto rounded-[16px] border border-border bg-card p-1 shadow-float"
        >
          {results.map((r, i) => (
            <li key={`${r.lngLat.join()}-${i}`}>
              <button
                type="button"
                role="option"
                aria-selected={value?.name === r.name}
                onClick={() => choose(r)}
                className="flex w-full items-start gap-3 rounded-[12px] p-2.5 text-left hover:bg-secondary transition-colors cursor-pointer"
              >
                <Icon name="location_on" className="text-primary text-[20px] mt-0.5" />
                <span className="flex-1 min-w-0">
                  <span className="block font-medium text-[14px] text-foreground truncate">
                    {r.name}
                  </span>
                  {r.detail && (
                    <span className="block text-[12px] text-muted-foreground truncate">
                      {r.detail}
                    </span>
                  )}
                </span>
                {value?.name === r.name && (
                  <Icon name="check" className="text-leading text-[18px]" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Full-screen Map Picker Modal */}
      {mapOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 flex flex-col bg-background">
            <header className="flex h-14 items-center justify-between border-b border-border px-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Close map"
                  onClick={() => setMapOpen(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-secondary"
                >
                  <Icon name="close" />
                </button>
                <h2 className="text-[17px] font-semibold">{label}: Tap any point on the map</h2>
              </div>
            </header>
            <div className="relative flex-1">
              <ClientOnly fallback={<div className="h-full w-full bg-map-land animate-pulse" />}>
                <Suspense fallback={<div className="h-full w-full bg-map-land animate-pulse" />}>
                  <div className="absolute inset-0">
                    <MapPicker value={mapPoint} onPick={pickOnMap} className="h-full w-full" />
                  </div>
                </Suspense>
              </ClientOnly>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border bg-card p-4">
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    "truncate font-medium text-[15px]",
                    !mapPoint && "text-muted-foreground",
                  )}
                >
                  {mapPoint
                    ? (mapPlace?.name ?? "Resolving place name...")
                    : "Tap anywhere on the map to place a pin"}
                </div>
                {mapPlace?.detail && (
                  <div className="truncate text-[12px] text-muted-foreground">
                    {mapPlace.detail}
                  </div>
                )}
              </div>
              <Button
                disabled={!mapPoint || !mapPlace}
                onClick={() => {
                  if (mapPlace) choose(mapPlace);
                  setMapOpen(false);
                }}
              >
                Use this place
              </Button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
