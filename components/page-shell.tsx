"use client";

import LightPillar from "@/components/light-pillar";
import ClickSpark from "@/components/ClickSpark";

export function PageShell({ children }: { children: React.ReactNode }) {
    return (
        <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-white isolate">
            {/* Background */}
            <LightPillar
                topColor="#6315c1"
                bottomColor="#050096"
                className="pointer-events-none absolute inset-0 z-0 opacity-80"
                mixBlendMode="screen"
                pillarRotation={45}
            />

            {/* Foreground */}
            <ClickSpark sparkColor="#6315c1">
                <div className="relative z-10">{children}</div>
            </ClickSpark>
        </div>
    );
}
