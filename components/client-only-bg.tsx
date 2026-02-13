"use client";

import { useEffect, useState } from "react";
import LightPillar from "@/components/light-pillar";

function isMobileUA() {
    if (typeof navigator === "undefined") return false;
    return /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent);
}

export default function ClientOnlyBackground() {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        setIsMobile(isMobileUA() || window.matchMedia("(max-width: 768px)").matches);
    }, []);

    // ✅ Mobile: background CSS (0 GPU)
    if (isMobile) {
        return (
            <div className="pointer-events-none absolute inset-0 opacity-80">
                <div className="absolute inset-0 bg-zinc-950" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,21,193,.35),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(46,220,89,.22),transparent_55%)]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(120,80,255,.25),transparent_45%),radial-gradient(circle_at_70%_60%,rgba(46,220,89,.18),transparent_45%)]" />
            </div>
        );
    }

    // ✅ Desktop: LightPillar
    return (
        <LightPillar
            topColor="#aa02f7"
            bottomColor="#2edc59"
            className="pointer-events-none opacity-70"
            mixBlendMode="screen"
        />
    );
}
