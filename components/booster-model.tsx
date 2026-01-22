"use client";

import { Canvas, ThreeEvent, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

const BODY_NAME = "Object_4"; // pack
const LABEL_NAME = "Object_6"; // central panel

type BoosterModelProps = {
    labelUrl?: string | null;
    onOpen?: () => void;
    canOpen?: boolean;
    theme?: BoosterTheme;
    shake?: number; // 0..1
};

type BoosterTheme = {
    body?: {
        color?: string;
        metalness?: number;
        roughness?: number;
        emissive?: string;
        emissiveIntensity?: number;
    };
    label?: {
        color?: string;
        metalness?: number;
        roughness?: number;
    };
};

function cloneSceneWithClonedMaterials(src: THREE.Object3D) {
    const cloned = src.clone(true);

    cloned.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;

        if (Array.isArray(mesh.material)) {
            mesh.material = mesh.material.map((m) => m.clone());
        } else if (mesh.material) {
            mesh.material = mesh.material.clone();
        }
    });

    return cloned;
}

function BoosterModel({ labelUrl, onOpen, canOpen = true, theme, shake = 0 }: BoosterModelProps) {
    const gltf = useGLTF("/models/booster.glb");
    const scene = useMemo(() => cloneSceneWithClonedMaterials(gltf.scene), [gltf.scene]);

    // ✅ IMPORTANT: on invalide le rendu en "frameloop demand"
    const invalidate = useThree((s) => s.invalidate);

    const labelMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
    const bodyMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
    const texRef = useRef<THREE.Texture | null>(null);

    useEffect(() => {
        const label = scene.getObjectByName(LABEL_NAME) as THREE.Mesh | null;
        if (label) {
            const mat = Array.isArray(label.material) ? label.material[0] : label.material;
            labelMatRef.current = (mat as THREE.MeshStandardMaterial) ?? null;
        }

        const body = scene.getObjectByName(BODY_NAME) as THREE.Mesh | null;
        if (body) {
            const mat = Array.isArray(body.material) ? body.material[0] : body.material;
            bodyMatRef.current = (mat as THREE.MeshStandardMaterial) ?? null;
        }

        return () => {
            labelMatRef.current = null;
            bodyMatRef.current = null;
        };
    }, [scene]);

    useEffect(() => {
        const bodyMat = bodyMatRef.current;
        if (bodyMat) {
            const color = theme?.body?.color ?? "#9ca3af";
            const metalness = theme?.body?.metalness ?? 0.15;
            const roughness = theme?.body?.roughness ?? 0.35;

            bodyMat.color.set(color);
            bodyMat.metalness = metalness;
            bodyMat.roughness = roughness;

            if (theme?.body?.emissive) {
                bodyMat.emissive.set(theme.body.emissive);
                bodyMat.emissiveIntensity = theme.body.emissiveIntensity ?? 0.2;
            } else {
                bodyMat.emissive.set("#000000");
                bodyMat.emissiveIntensity = 0;
            }

            bodyMat.needsUpdate = true;
        }

        const labelMat = labelMatRef.current;
        if (labelMat) {
            if (theme?.label?.color) labelMat.color.set(theme.label.color);
            if (typeof theme?.label?.metalness === "number") labelMat.metalness = theme.label.metalness;
            if (typeof theme?.label?.roughness === "number") labelMat.roughness = theme.label.roughness;

            labelMat.needsUpdate = true;
        }

        // ✅ on force 1 rendu quand le thème change
        invalidate();
    }, [theme, scene, invalidate]);

    // charge et applique la texture (sans setState)
    useEffect(() => {
        const mat = labelMatRef.current;
        if (!mat) return;

        if (texRef.current) {
            texRef.current.dispose();
            texRef.current = null;
        }

        if (!labelUrl) {
            mat.map = null;
            mat.needsUpdate = true;
            invalidate();
            return;
        }

        let cancelled = false;

        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin("anonymous");

        loader.load(
            labelUrl,
            (tex) => {
                if (cancelled) {
                    tex.dispose();
                    return;
                }

                const t = tex.clone();
                tex.dispose();

                t.colorSpace = THREE.SRGBColorSpace;
                t.flipY = true;
                t.needsUpdate = true;

                texRef.current = t;
                mat.map = t;
                mat.needsUpdate = true;

                // ✅ render demandé
                invalidate();
            },
            undefined,
            (err) => console.error("Texture load error:", err)
        );

        return () => {
            cancelled = true;
        };
    }, [labelUrl, scene, invalidate]);

    const downRef = useRef<{ x: number; y: number; t: number } | null>(null);

    const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
        if (!canOpen) return;
        downRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    };

    const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
        if (!canOpen || !onOpen || !downRef.current) return;

        const dx = Math.abs(e.clientX - downRef.current.x);
        const dy = Math.abs(e.clientY - downRef.current.y);
        const dt = performance.now() - downRef.current.t;
        downRef.current = null;

        if (dx > 6 || dy > 6 || dt > 350) return;
        if ((e.object as THREE.Object3D)?.name !== LABEL_NAME) return;

        onOpen();
    };

    const shakeRef = useRef(0);
    useEffect(() => {
        shakeRef.current = shake ?? 0;
    }, [shake]);

    // ✅ boucle anim mais seulement quand utile, + invalidate()
    useEffect(() => {
        const root = scene;
        const baseRot = root.rotation.clone();
        let raf = 0;

        const loop = () => {
            const s = shakeRef.current;
            const t = performance.now() / 1000;

            let needsMoreFrames = false;

            if (s > 0) {
                root.rotation.x = baseRot.x + Math.sin(t * 22) * 0.02 * s;
                root.rotation.y = baseRot.y + Math.cos(t * 18) * 0.02 * s;
                root.rotation.z = baseRot.z + Math.sin(t * 30) * 0.01 * s;
                needsMoreFrames = true;
            } else {
                // lerp retour
                root.rotation.x += (baseRot.x - root.rotation.x) * 0.15;
                root.rotation.y += (baseRot.y - root.rotation.y) * 0.15;
                root.rotation.z += (baseRot.z - root.rotation.z) * 0.15;

                const dx = Math.abs(root.rotation.x - baseRot.x);
                const dy = Math.abs(root.rotation.y - baseRot.y);
                const dz = Math.abs(root.rotation.z - baseRot.z);
                needsMoreFrames = dx + dy + dz > 0.0005;
            }

            // ✅ on demande un rendu uniquement si ça bouge
            if (needsMoreFrames) {
                invalidate();
                raf = requestAnimationFrame(loop);
            }
        };

        // lance 1 frame (et ça s’arrête tout seul si stable)
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [scene, invalidate]);

    return (
        <primitive
            object={scene}
            scale={0.55}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
        />
    );
}

function Controls({ lockControls }: { lockControls: boolean }) {
    const controlsRef = useRef<OrbitControlsImpl | null>(null);
    const invalidate = useThree((s) => s.invalidate);

    useEffect(() => {
        controlsRef.current?.saveState();
    }, []);

    return (
        <OrbitControls
            ref={controlsRef}
            enablePan={false}
            enableZoom
            zoomSpeed={0.8}
            minDistance={1.5}
            maxDistance={15}
            enableRotate={!lockControls}
            enableDamping
            dampingFactor={0.08}
            // ✅ super important en frameloop demand
            onChange={() => invalidate()}
        />
    );
}

export function BoosterScene({
    labelUrl,
    onOpen,
    canOpen = true,
    theme,
    shake = 0,
    resetOrbitKey = 0,
    lockControls = false,
}: {
    labelUrl?: string | null;
    onOpen?: () => void;
    canOpen?: boolean;
    theme?: BoosterTheme;
    shake?: number;
    resetOrbitKey?: number;
    lockControls?: boolean;
}) {
    return (
        <div className="w-full h-105 overflow-hidden">
            <Canvas
                frameloop="demand"
                camera={{ position: [0, 1.2, 5.5], fov: 40 }}
                dpr={[1, 1.75]}
                gl={{ antialias: false, powerPreference: "high-performance" }}
            >
                {/* ✅ lights réduites (gros gain mobile) */}
                <ambientLight intensity={0.8} />
                <directionalLight position={[2, 3, 2]} intensity={1.2} />

                <Suspense fallback={null}>
                    <BoosterModel
                        labelUrl={labelUrl}
                        onOpen={onOpen}
                        canOpen={canOpen}
                        theme={theme}
                        shake={shake}
                    />
                </Suspense>

                <Controls lockControls={lockControls} />
            </Canvas>
        </div>
    );
}

useGLTF.preload("/models/booster.glb");
