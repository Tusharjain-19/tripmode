import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useNetworkStatus } from "./network";

describe("Network status monitoring", () => {
  it("defaults to online in browser environment", () => {
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isOnline).toBe(true);
    expect(result.current.isChecking).toBe(false);
  });

  it("reacts to window offline and online events", () => {
    const { result } = renderHook(() => useNetworkStatus());

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current.isOnline).toBe(false);
    expect(result.current.wasOffline).toBe(true);

    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current.isOnline).toBe(true);
  });
});

