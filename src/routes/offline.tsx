import { createFileRoute } from "@tanstack/react-router";
import { NoInternetScreen } from "@/components/common/NoInternetScreen";
import { Screen } from "@/components/trip/ui";

export const Route = createFileRoute("/offline")({
  head: () => ({
    meta: [
      { title: "No Internet Connection - Trip Mode" },
      { name: "description", content: "You are currently offline. Check your network connection to rejoin the convoy." },
    ],
  }),
  component: OfflinePage,
});

function OfflinePage() {
  return (
    <Screen maxWidth="max-w-md">
      <NoInternetScreen />
    </Screen>
  );
}
