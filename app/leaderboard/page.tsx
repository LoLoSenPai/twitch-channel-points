import PageShell from "@/components/page-shell";
import { LeaderboardPanel } from "@/components/leaderboard-panel";

export default function LeaderboardPage() {
  return (
    <PageShell>
      <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-10">
        <LeaderboardPanel />
      </main>
    </PageShell>
  );
}