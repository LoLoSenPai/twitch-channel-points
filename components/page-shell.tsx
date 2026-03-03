import ClientOnlyBackground from "@/components/client-only-bg";
import SiteNavbar from "@/components/site-navbar";

export default function PageShell({ children }: { children: React.ReactNode }) {
    return (
        <div className="relative min-h-screen isolate bg-[color:var(--site-shell-bg)] text-[color:var(--site-shell-text)] transition-colors duration-200">
            <div className="pointer-events-none fixed inset-0 z-0">
                <ClientOnlyBackground />
            </div>
            <div className="relative z-20">
                <SiteNavbar />
            </div>
            <div className="relative z-10">{children}</div>
        </div>
    );
}
