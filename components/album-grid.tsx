"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import stickers from "@/stickers/stickers.json";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { useWallet } from "@solana/wallet-adapter-react";

type Mint = { stickerId: string; mintTx: string };
type Me = {
    mints: Mint[];
    totalStickers?: number;
    user?: { displayName?: string };
};

type StickerItem = {
    id: string;
    name?: string;
    image?: string;
    rarity?: string;
};

type StickerJson = {
    total?: number;
    items: StickerItem[];
};

type AlbumSlot = {
    slotNumber: number;
    sticker?: StickerItem;
};

type SelectedCard = {
    slotNumber: number;
    name: string;
    imageSrc: string;
    qty: number;
    rarity?: string;
};

const ST = stickers as StickerJson;
const SLOTS_PER_PAGE = 9;
const SLOTS_PER_SPREAD = SLOTS_PER_PAGE * 2;

const IMAGE_BASE =
    process.env.NEXT_PUBLIC_STICKERS_IMAGE_BASE?.trim() || "/stickers/";

function resolveStickerImageSrc(image?: string) {
    const value = (image ?? "").trim();
    if (!value) return null;

    if (value.startsWith("http://") || value.startsWith("https://")) return value;
    if (value.startsWith("/")) return value;

    const base = IMAGE_BASE.endsWith("/") ? IMAGE_BASE : `${IMAGE_BASE}/`;
    return `${base}${value}`;
}

function buildSlots(totalSlots: number, items: StickerItem[]): AlbumSlot[] {
    const sortedItems = [...items].sort((a, b) => {
        const aa = Number(a.id);
        const bb = Number(b.id);
        if (Number.isFinite(aa) && Number.isFinite(bb)) return aa - bb;
        return String(a.id).localeCompare(String(b.id));
    });

    const bySlotNumber = new Map<number, StickerItem>();
    const overflow: StickerItem[] = [];

    for (const item of sortedItems) {
        const slotNumber = Number(item.id);
        if (
            Number.isInteger(slotNumber) &&
            slotNumber >= 1 &&
            slotNumber <= totalSlots &&
            !bySlotNumber.has(slotNumber)
        ) {
            bySlotNumber.set(slotNumber, item);
        } else {
            overflow.push(item);
        }
    }

    let overflowIndex = 0;
    const slots: AlbumSlot[] = [];

    for (let slotNumber = 1; slotNumber <= totalSlots; slotNumber += 1) {
        const sticker = bySlotNumber.get(slotNumber) ?? overflow[overflowIndex++];
        slots.push({ slotNumber, sticker });
    }

    return slots;
}

function chunkSlots(slots: AlbumSlot[]) {
    const chunks: AlbumSlot[][] = [];
    for (let i = 0; i < slots.length; i += SLOTS_PER_SPREAD) {
        chunks.push(slots.slice(i, i + SLOTS_PER_SPREAD));
    }
    return chunks;
}

function normalizeRarity(value: unknown) {
    const v = String(value ?? "").trim().toLowerCase();
    if (!v) return "";
    return v;
}

function isHoloRarity(value: unknown) {
    const rarity = normalizeRarity(value);
    return rarity === "legendary" || rarity === "mythic";
}

function AlbumLeaf({
    side,
    pageNumber,
    slots,
    ownedMap,
    onCardSelect,
}: {
    side: "left" | "right";
    pageNumber: number;
    slots: AlbumSlot[];
    ownedMap: Map<string, number>;
    onCardSelect: (card: SelectedCard) => void;
}) {
    const paddedSlots: (AlbumSlot | null)[] = [...slots];
    while (paddedSlots.length < SLOTS_PER_PAGE) paddedSlots.push(null);

    return (
        <div className={cn("album-leaf", side === "left" ? "album-leaf-left" : "album-leaf-right")}>
            <div
                className={cn(
                    "album-ring-strip",
                    side === "left" ? "album-ring-strip-left" : "album-ring-strip-right"
                )}
                aria-hidden="true"
            >
                <span className="album-ring-hole" />
                <span className="album-ring-hole" />
                <span className="album-ring-hole" />
            </div>
            <div className="album-page-number">Page {pageNumber}</div>
            <div className="album-slot-grid">
                {paddedSlots.map((slot, index) => {
                    const delayMs = index * 34;
                    if (!slot) {
                        return (
                            <article
                                key={`blank-${side}-${index}`}
                                className="album-slot album-slot-empty"
                                style={{ animationDelay: `${delayMs}ms` }}
                            >
                                <div className="album-slot-frame">
                                    <div className="album-slot-pocket" />
                                </div>
                            </article>
                        );
                    }

                    const stickerId = slot.sticker ? String(slot.sticker.id) : null;
                    const qty = stickerId ? (ownedMap.get(stickerId) ?? 0) : 0;
                    const owned = qty > 0;
                    const imageSrc = resolveStickerImageSrc(slot.sticker?.image);
                    const hasMetadata = Boolean(slot.sticker);

                    return (
                        <article
                            key={`slot-${slot.slotNumber}`}
                            className={cn(
                                "album-slot",
                                owned && "album-slot-owned",
                                hasMetadata && !owned && "album-slot-missing",
                                !hasMetadata && "album-slot-secret"
                            )}
                            style={{ animationDelay: `${delayMs}ms` }}
                        >
                            <div className="album-slot-frame">
                                {owned && imageSrc ? (
                                    <button
                                        type="button"
                                        className="album-slot-card-button"
                                        onClick={() =>
                                            onCardSelect({
                                                slotNumber: slot.slotNumber,
                                                name: slot.sticker?.name ?? `Sticker #${slot.slotNumber}`,
                                                imageSrc,
                                                qty,
                                                rarity:
                                                    slot.sticker?.rarity ??
                                                    ST.items.find(
                                                        (item) =>
                                                            String(item.id) === String(slot.slotNumber)
                                                    )?.rarity,
                                            })
                                        }
                                    >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={imageSrc}
                                            alt={slot.sticker?.name ?? `Sticker #${slot.slotNumber}`}
                                            className="album-slot-image"
                                            loading="lazy"
                                        />
                                    </button>
                                ) : (
                                    <div className="album-slot-pocket">
                                        {hasMetadata ? (
                                            <span className="album-slot-pocket-id">#{slot.slotNumber}</span>
                                        ) : null}
                                    </div>
                                )}

                                {owned ? <span className="album-slot-badge">x{qty}</span> : null}
                            </div>
                        </article>
                    );
                })}
            </div>
        </div>
    );
}

export function AlbumGrid() {
    const wallet = useWallet();
    const [me, setMe] = useState<Me | null>(null);
    const [loading, setLoading] = useState(true);
    const [spreadIndex, setSpreadIndex] = useState(0);
    const [turnDirection, setTurnDirection] = useState<"idle" | "next" | "prev">("idle");
    const [selectedCard, setSelectedCard] = useState<SelectedCard | null>(null);
    const [mounted, setMounted] = useState(false);
    const [holoPointer, setHoloPointer] = useState({
        x: 50,
        y: 50,
        rx: 0,
        ry: 0,
        pointerFromCenter: 0,
        backgroundX: 50,
        backgroundY: 50,
    });
    const turnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        let active = true;

        (async () => {
            try {
                const walletPubkey = wallet.publicKey?.toBase58();
                const url = walletPubkey
                    ? `/api/me?walletPubkey=${encodeURIComponent(walletPubkey)}`
                    : "/api/me";
                const response = await fetch(url, { cache: "no-store" });
                if (!active) return;
                if (response.ok) {
                    setMe(await response.json());
                } else {
                    setMe(null);
                }
            } finally {
                if (active) setLoading(false);
            }
        })();

        return () => {
            active = false;
            if (turnTimer.current) clearTimeout(turnTimer.current);
        };
    }, [wallet.publicKey]);

    useEffect(() => {
        setMounted(true);
    }, []);

    const ownedMap = useMemo(() => {
        const map = new Map<string, number>();
        for (const mint of me?.mints ?? []) {
            const id = String(mint.stickerId);
            map.set(id, (map.get(id) ?? 0) + 1);
        }
        return map;
    }, [me]);

    const totalSlots = Math.max(
        me?.totalStickers ?? 0,
        ST.total ?? 0,
        ST.items.length,
        1
    );

    const slots = useMemo(() => buildSlots(totalSlots, ST.items), [totalSlots]);
    const spreads = useMemo(() => chunkSlots(slots), [slots]);

    useEffect(() => {
        setSpreadIndex((prev) => Math.min(prev, Math.max(spreads.length - 1, 0)));
    }, [spreads.length]);

    const uniqueOwnedCount = useMemo(() => {
        let count = 0;
        for (const slot of slots) {
            const stickerId = slot.sticker ? String(slot.sticker.id) : null;
            if (stickerId && (ownedMap.get(stickerId) ?? 0) > 0) count += 1;
        }
        return count;
    }, [slots, ownedMap]);

    const mintedTotal = me?.mints.length ?? 0;
    const duplicates = Math.max(0, mintedTotal - uniqueOwnedCount);
    const completion = Math.round((uniqueOwnedCount / totalSlots) * 100);

    const currentSpread = spreads[spreadIndex] ?? [];
    const leftSlots = currentSpread.slice(0, SLOTS_PER_PAGE);
    const rightSlots = currentSpread.slice(SLOTS_PER_PAGE, SLOTS_PER_SPREAD);

    const leftPageNumber = spreadIndex * 2 + 1;
    const rightPageNumber = leftPageNumber + 1;
    const selectedRarity = normalizeRarity(selectedCard?.rarity);
    const holoEnabled = isHoloRarity(selectedRarity);
    const cardFxStyle: CSSProperties = {
        "--card-pointer-x": `${holoPointer.x}%`,
        "--card-pointer-y": `${holoPointer.y}%`,
        "--card-rotate-x": `${holoPointer.rx}deg`,
        "--card-rotate-y": `${holoPointer.ry}deg`,
        "--pointer-from-center": `${holoPointer.pointerFromCenter}`,
        "--background-x": `${holoPointer.backgroundX}%`,
        "--background-y": `${holoPointer.backgroundY}%`,
        transform: `perspective(1100px) rotateX(${holoPointer.rx}deg) rotateY(${holoPointer.ry}deg) scale(1.01)`,
    } as CSSProperties;

    const moveTo = (nextIndex: number, direction: "next" | "prev") => {
        if (nextIndex < 0 || nextIndex >= spreads.length) return;
        if (nextIndex === spreadIndex) return;

        setSpreadIndex(nextIndex);
        setTurnDirection(direction);

        if (turnTimer.current) clearTimeout(turnTimer.current);
        turnTimer.current = setTimeout(() => {
            setTurnDirection("idle");
            turnTimer.current = null;
        }, 420);
    };

    const updateHoloFromCoords = (
        clientX: number,
        clientY: number,
        element: HTMLDivElement
    ) => {
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        const px = ((clientX - rect.left) / rect.width) * 100;
        const py = ((clientY - rect.top) / rect.height) * 100;
        const clampedX = Math.max(0, Math.min(100, px));
        const clampedY = Math.max(0, Math.min(100, py));
        const nx = (clampedX - 50) / 50;
        const ny = (clampedY - 50) / 50;
        const distance = Math.min(1, Math.sqrt(nx * nx + ny * ny));
        const pointerFromCenter = 1 - distance;

        setHoloPointer({
            x: clampedX,
            y: clampedY,
            rx: -(ny * 18),
            ry: nx * 18,
            pointerFromCenter,
            backgroundX: 50 + nx * 35,
            backgroundY: 50 + ny * 35,
        });
    };

    const updateHoloFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
        updateHoloFromCoords(event.clientX, event.clientY, event.currentTarget);
    };

    const updateHoloFromMouse = (event: React.MouseEvent<HTMLDivElement>) => {
        updateHoloFromCoords(event.clientX, event.clientY, event.currentTarget);
    };

    const resetHoloPointer = () => {
        setHoloPointer({
            x: 50,
            y: 50,
            rx: 0,
            ry: 0,
            pointerFromCenter: 0,
            backgroundX: 50,
            backgroundY: 50,
        });
    };

    return (
        <section className="panini-album">
            <header className="album-hero">
                <div className="album-hero-headline">
                    <p className="album-kicker">NYLS COLLECTION</p>
                    <h2 className="album-title">Ton album Panini</h2>
                    <p className="album-subtitle">
                        {loading
                            ? "Chargement de ton album..."
                            : me?.user?.displayName
                                ? `${me.user.displayName}, complète la collection en mintant chaque case.`
                                : "Connecte Twitch pour afficher ton avancement complet."}
                    </p>
                </div>

                <div className="album-stats">
                    <p>
                        Possedés <strong>{uniqueOwnedCount}</strong> / <strong>{totalSlots}</strong>
                    </p>
                    <p>
                        NFTs mintés <strong>{mintedTotal}</strong>
                    </p>
                    <p>
                        Doublons <strong>{duplicates}</strong>
                    </p>
                    <div className="album-progress" role="progressbar" aria-valuenow={completion} aria-valuemin={0} aria-valuemax={100}>
                        <div className="album-progress-fill" style={{ width: `${completion}%` }} />
                    </div>
                    <p className="album-progress-label">Completion: {completion}%</p>
                </div>
            </header>

            <div className={cn("album-book", turnDirection !== "idle" && `turn-${turnDirection}`)}>
                <div className="album-spine" aria-hidden="true" />

                <AlbumLeaf
                    side="left"
                    pageNumber={leftPageNumber}
                    slots={leftSlots}
                    ownedMap={ownedMap}
                    onCardSelect={setSelectedCard}
                />

                <AlbumLeaf
                    side="right"
                    pageNumber={rightPageNumber}
                    slots={rightSlots}
                    ownedMap={ownedMap}
                    onCardSelect={setSelectedCard}
                />
            </div>

            <footer className="album-controls">
                <button
                    type="button"
                    className="album-control-btn"
                    onClick={() => moveTo(spreadIndex - 1, "prev")}
                    disabled={spreadIndex === 0}
                >
                    Page precedente
                </button>

                <p className="album-control-label">
                    Double page {spreadIndex + 1} / {Math.max(spreads.length, 1)}
                </p>

                <button
                    type="button"
                    className="album-control-btn"
                    onClick={() => moveTo(spreadIndex + 1, "next")}
                    disabled={spreadIndex >= spreads.length - 1}
                >
                    Page suivante
                </button>
            </footer>

            {mounted
                ? createPortal(
                    <AnimatePresence>
                        {selectedCard ? (
                            <motion.div
                                className="album-card-overlay"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setSelectedCard(null)}
                            >
                                <motion.div
                                    className="album-card-overlay-inner"
                                    initial={{ scale: 0.8, y: 24, rotate: -2 }}
                                    animate={{ scale: 1, y: 0, rotate: 0 }}
                                    exit={{ scale: 0.85, y: 16, rotate: 1 }}
                                    transition={{ type: "spring", stiffness: 260, damping: 24 }}
                                    onClick={(event) => event.stopPropagation()}
                                >
                                    <div
                                        className={cn(
                                            "album-card-zoom",
                                            "album-card-zoom-tilt",
                                            holoEnabled && "album-card-zoom-holo",
                                            selectedRarity === "legendary" && "album-card-zoom-holo-legendary",
                                            selectedRarity === "mythic" && "album-card-zoom-holo-mythic"
                                        )}
                                        style={cardFxStyle}
                                        onPointerMove={updateHoloFromPointer}
                                        onMouseMove={updateHoloFromMouse}
                                        onPointerLeave={resetHoloPointer}
                                        onMouseLeave={resetHoloPointer}
                                    >
                                        <div className="album-card-zoom-media">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={selectedCard.imageSrc}
                                                alt={selectedCard.name}
                                                className="album-card-zoom-image"
                                            />
                                        </div>
                                        {holoEnabled ? (
                                            <>
                                                <span className="album-card-holo-glare" />
                                                <span className="album-card-holo-sparkle" />
                                            </>
                                        ) : null}
                                    </div>
                                    {/* <div className="album-card-zoom-caption">
                                        <p className="album-card-zoom-title">{selectedCard.name}</p>
                                        <p className="album-card-zoom-sub">x{selectedCard.qty}</p>
                                    </div> */}
                                </motion.div>
                            </motion.div>
                        ) : null}
                    </AnimatePresence>,
                    document.body
                )
                : null}
        </section>
    );
}
