import ClientOnlyBackground from "@/components/client-only-bg";

export default function PageShell({ children }: { children: React.ReactNode }) {
    return (
        <div className="relative min-h-screen bg-zinc-950 text-white isolate">
            <div className="pointer-events-none fixed inset-0 z-0">
                <ClientOnlyBackground />
            </div>
            <div className="relative z-10">{children}</div>
        </div>
    );
}
