"use client";

import { useEffect, useMemo, useState } from "react";
import stickers from "@/stickers/stickers.json";

type Mint = { stickerId: string; mintTx: string };
type Me = { mints: Mint[]; totalStickers: number };

type StickerJson = {
    total?: number;
    items: Array<{ id: string; name?: string; image?: string }>;
};

const ST = stickers as StickerJson;

const IMAGE_BASE =
    process.env.NEXT_PUBLIC_STICKERS_IMAGE_BASE?.trim() || "/stickers/";

function resolveStickerImageSrc(image?: string) {
    const v = (image ?? "").trim();
    if (!v) return null;

    // URL absolue
    if (v.startsWith("http://") || v.startsWith("https://")) return v;

    // chemin absolu local
    if (v.startsWith("/")) return v;

    // filename => base (ipfs gateway ou /stickers/)
    const base = IMAGE_BASE.endsWith("/") ? IMAGE_BASE : `${IMAGE_BASE}/`;
    return `${base}${v}`;
}

export function AlbumGrid() {
    const [me, setMe] = useState<Me | null>(null);

    useEffect(() => {
        (async () => {
            const r = await fetch("/api/me", { cache: "no-store" });
            if (r.ok) setMe(await r.json());
        })();
    }, []);

    const ownedMap = useMemo(() => {
        const map = new Map<string, number>();
        for (const m of me?.mints ?? []) {
            const id = String(m.stickerId);
            map.set(id, (map.get(id) ?? 0) + 1);
        }
        return map;
    }, [me]);

    const total = ST.total ?? ST.items.length;

    const ownedCount = useMemo(() => {
        let c = 0;
        for (const s of ST.items) if ((ownedMap.get(String(s.id)) ?? 0) > 0) c++;
        return c;
    }, [ownedMap]);

    return (
        <div className="space-y-3">
            <div className="rounded-2xl border p-4">
                <div className="text-lg font-semibold">Album</div>
                <div className="text-sm opacity-70">
                    Possédés: <span className="font-medium">{ownedCount}</span> / {total}
                    <span className="ml-2 opacity-60">
                        (stickers mintés: {me?.mints.length ?? "—"})
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {ST.items.map((s) => {
                    const id = String(s.id);
                    const qty = ownedMap.get(id) ?? 0;
                    const owned = qty > 0;

                    const imgSrc = resolveStickerImageSrc(s.image);

                    return (
                        <div
                            key={id}
                            className={`rounded-2xl border p-3 space-y-2 ${owned ? "" : "opacity-40"
                                }`}
                        >
                            <div className="rounded-xl border aspect-square flex items-center justify-center text-sm opacity-80 overflow-hidden">
                                {imgSrc ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={imgSrc}
                                        alt={s.name ?? `Sticker #${id}`}
                                        className="h-full w-full object-cover"
                                        loading="lazy"
                                    />
                                ) : (
                                    <span className="font-semibold">#{id}</span>
                                )}
                            </div>

                            <div className="text-sm">
                                <div className="font-medium truncate">
                                    {s.name ?? `Sticker #${id}`}
                                </div>
                                <div className="text-xs opacity-70">
                                    {owned ? `x${qty}` : "manquant"}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
