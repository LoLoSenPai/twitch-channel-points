import ClientOnlyBackground from "@/components/client-only-bg";

export default function PageShell({ children }: { children: React.ReactNode }) {
    return (
        <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-white isolate">
            <ClientOnlyBackground />
            <div className="relative z-10">{children}</div>
        </div>
    );
}
