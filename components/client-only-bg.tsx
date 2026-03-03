"use client";

import { useEffect, useState } from "react";
import LightPillar from "@/components/light-pillar";

function isMobileUA() {
    if (typeof navigator === "undefined") return false;
    return /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent);
}

function computeShouldRenderStatic() {
    if (typeof window === "undefined" || typeof navigator === "undefined") return true;
    try {
        // Safe default: static background unless explicitly opted-in.
        const bgMode = window.localStorage.getItem("site.bg_mode");
        const forceAnimated = bgMode === "animated";
        const mobile = isMobileUA() || window.matchMedia("(max-width: 768px)").matches;
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const hardwareThreads =
            typeof navigator.hardwareConcurrency === "number" ? navigator.hardwareConcurrency : 8;
        const deviceMemory =
            typeof (navigator as Navigator & { deviceMemory?: number }).deviceMemory === "number"
                ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory!
                : 8;
        const lowEndDevice = hardwareThreads <= 4 || deviceMemory <= 4;
        const boosterMode = window.localStorage.getItem("mint.booster.render_mode");
        const prefersLightBooster = boosterMode === "image";
        if (!forceAnimated) return true;
        return mobile || reducedMotion || lowEndDevice || prefersLightBooster;
    } catch {
        return true;
    }
}

export default function ClientOnlyBackground() {
    const [renderStaticBg, setRenderStaticBg] = useState<boolean>(() => computeShouldRenderStatic());

    useEffect(() => {
        const onStorage = (event: StorageEvent) => {
            if (
                !event.key ||
                event.key === "mint.booster.render_mode" ||
                event.key === "site.bg_mode"
            ) {
                setRenderStaticBg(computeShouldRenderStatic());
            }
        };

        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
    }, []);

    if (renderStaticBg) {
        return (
            <div className="pointer-events-none absolute inset-0 opacity-80">
                <div className="absolute inset-0 bg-zinc-950" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,21,193,.35),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(46,220,89,.22),transparent_55%)]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(120,80,255,.25),transparent_45%),radial-gradient(circle_at_70%_60%,rgba(46,220,89,.18),transparent_45%)]" />
            </div>
        );
    }

    return (
        <LightPillar
            topColor="#aa02f7"
            bottomColor="#2edc59"
            className="pointer-events-none opacity-70"
            mixBlendMode="screen"
        />
    );
}
