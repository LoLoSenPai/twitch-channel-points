"use client";

import { Canvas, ThreeEvent, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

const BODY_NAME = "Object_4";
const LABEL_NAME = "Object_6";
const FRONT_LABEL_PLANE = "FrontLabelPlane";
const BACK_LABEL_PLANE = "BackLabelPlane";

// Booster label tuning knobs.
const LABEL_PLANE_BASE_SCALE_X = 2.80;
const LABEL_PLANE_BASE_SCALE_Y = 2.80;
const FRONT_LABEL_SCALE = 1.0;
const BACK_LABEL_SCALE = 1.0;
const LABEL_Z_OFFSET_MIN = 0.006;
const LABEL_Z_OFFSET_BIAS = 0.004;

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

type BoosterModelProps = {
    labelUrl?: string | null;
    backLabelUrl?: string | null;
    onOpen?: () => void;
    canOpen?: boolean;
    theme?: BoosterTheme;
    shake?: number;
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

function createPlaneMaterial() {
    return new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        side: THREE.FrontSide,
        depthTest: false,
        depthWrite: false,
    });
}

function BoosterModel({
    labelUrl,
    backLabelUrl,
    onOpen,
    canOpen = true,
    theme,
    shake = 0,
}: BoosterModelProps) {
    const gltf = useGLTF("/models/booster.glb");
    const scene = useMemo(() => cloneSceneWithClonedMaterials(gltf.scene), [gltf.scene]);
    const gl = useThree((s) => s.gl);
    const invalidate = useThree((s) => s.invalidate);

    const labelMeshRef = useRef<THREE.Mesh | null>(null);
    const labelMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
    const bodyMatRef = useRef<THREE.MeshStandardMaterial | null>(null);

    const frontPlaneRef = useRef<THREE.Mesh | null>(null);
    const backPlaneRef = useRef<THREE.Mesh | null>(null);

    const frontTexRef = useRef<THREE.Texture | null>(null);
    const backTexRef = useRef<THREE.Texture | null>(null);

    useEffect(() => {
        const label = scene.getObjectByName(LABEL_NAME) as THREE.Mesh | null;
        labelMeshRef.current = label;
        if (label) {
            const mat = Array.isArray(label.material) ? label.material[0] : label.material;
            labelMatRef.current = (mat as THREE.MeshStandardMaterial) ?? null;

            const labelBox = new THREE.Box3().setFromObject(label);
            const size = new THREE.Vector3();
            const center = new THREE.Vector3();
            labelBox.getSize(size);
            labelBox.getCenter(center);

            const planeW = size.x * LABEL_PLANE_BASE_SCALE_X;
            const planeH = size.y * LABEL_PLANE_BASE_SCALE_Y;
            const zOffset = Math.max(
                LABEL_Z_OFFSET_MIN,
                size.z * 0.5 + LABEL_Z_OFFSET_BIAS,
            );

            const front = new THREE.Mesh(
                new THREE.PlaneGeometry(planeW, planeH),
                createPlaneMaterial(),
            );
            front.name = FRONT_LABEL_PLANE;
            front.position.set(center.x, center.y, center.z + zOffset);
            front.renderOrder = 30;
            front.scale.set(FRONT_LABEL_SCALE, FRONT_LABEL_SCALE, 1);

            const back = new THREE.Mesh(
                new THREE.PlaneGeometry(planeW, planeH),
                createPlaneMaterial(),
            );
            back.name = BACK_LABEL_PLANE;
            back.position.set(center.x, center.y, center.z - zOffset);
            back.rotation.y = Math.PI;
            back.renderOrder = 30;
            back.scale.set(BACK_LABEL_SCALE, BACK_LABEL_SCALE, 1);

            scene.add(front);
            scene.add(back);
            frontPlaneRef.current = front;
            backPlaneRef.current = back;
        }

        const body = scene.getObjectByName(BODY_NAME) as THREE.Mesh | null;
        if (body) {
            const mat = Array.isArray(body.material) ? body.material[0] : body.material;
            bodyMatRef.current = (mat as THREE.MeshStandardMaterial) ?? null;
        }

        return () => {
            labelMeshRef.current = null;
            labelMatRef.current = null;
            bodyMatRef.current = null;

            if (frontTexRef.current) {
                frontTexRef.current.dispose();
                frontTexRef.current = null;
            }
            if (backTexRef.current) {
                backTexRef.current.dispose();
                backTexRef.current = null;
            }

            if (frontPlaneRef.current) {
                scene.remove(frontPlaneRef.current);
                frontPlaneRef.current.geometry.dispose();
                const mat = frontPlaneRef.current.material;
                if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
                else mat.dispose();
                frontPlaneRef.current = null;
            }

            if (backPlaneRef.current) {
                scene.remove(backPlaneRef.current);
                backPlaneRef.current.geometry.dispose();
                const mat = backPlaneRef.current.material;
                if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
                else mat.dispose();
                backPlaneRef.current = null;
            }
        };
    }, [scene]);

    useEffect(() => {
        const hasCustomLabel = Boolean(labelUrl || backLabelUrl);
        if (labelMeshRef.current) {
            labelMeshRef.current.visible = !hasCustomLabel;
        }

        const bodyMat = bodyMatRef.current;
        if (bodyMat) {
            // Force a plain metallic body color from theme (ignore GLB baked dark maps).
            bodyMat.map = null;
            bodyMat.alphaMap = null;
            bodyMat.metalnessMap = null;
            bodyMat.roughnessMap = null;
            bodyMat.normalMap = null;
            bodyMat.aoMap = null;
            bodyMat.color.set(theme?.body?.color ?? "#9ca3af");
            bodyMat.metalness = theme?.body?.metalness ?? 0.15;
            bodyMat.roughness = theme?.body?.roughness ?? 0.35;
            bodyMat.envMapIntensity = 0.6;

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

        invalidate();
    }, [theme, labelUrl, backLabelUrl, invalidate]);

    useEffect(() => {
        const frontPlane = frontPlaneRef.current;
        const backPlane = backPlaneRef.current;
        if (!frontPlane || !backPlane) return;

        const frontMat = frontPlane.material as THREE.MeshBasicMaterial;
        const backMat = backPlane.material as THREE.MeshBasicMaterial;

        if (frontTexRef.current) {
            frontTexRef.current.dispose();
            frontTexRef.current = null;
        }
        if (backTexRef.current) {
            backTexRef.current.dispose();
            backTexRef.current = null;
        }

        frontMat.map = null;
        frontMat.opacity = 0;
        frontMat.needsUpdate = true;

        backMat.map = null;
        backMat.opacity = 0;
        backMat.needsUpdate = true;

        const frontSrc = labelUrl?.trim();
        const backSrc = (backLabelUrl?.trim() || frontSrc || "").trim();
        if (!frontSrc) {
            invalidate();
            return;
        }

        let cancelled = false;
        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin("anonymous");

        const assignTexture = (
            src: string,
            mat: THREE.MeshBasicMaterial,
            sink: { current: THREE.Texture | null },
        ) => {
            loader.load(
                src,
                (tex) => {
                    if (cancelled) {
                        tex.dispose();
                        return;
                    }
                    const t = tex.clone();
                    tex.dispose();

                    t.colorSpace = THREE.SRGBColorSpace;
                    t.flipY = true;
                    t.wrapS = THREE.ClampToEdgeWrapping;
                    t.wrapT = THREE.ClampToEdgeWrapping;
                    t.minFilter = THREE.LinearMipmapLinearFilter;
                    t.magFilter = THREE.LinearFilter;
                    t.anisotropy = Math.min(4, gl.capabilities.getMaxAnisotropy());
                    t.needsUpdate = true;

                    sink.current = t;
                    mat.map = t;
                    mat.opacity = 1;
                    mat.needsUpdate = true;
                    invalidate();
                },
                undefined,
                (err) => console.error("Label texture load error:", err),
            );
        };

        assignTexture(frontSrc, frontMat, frontTexRef);
        assignTexture(backSrc, backMat, backTexRef);

        return () => {
            cancelled = true;
        };
    }, [labelUrl, backLabelUrl, gl, invalidate]);

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

        const name = (e.object as THREE.Object3D)?.name;
        if (name !== LABEL_NAME && name !== FRONT_LABEL_PLANE && name !== BACK_LABEL_PLANE) return;

        onOpen();
    };

    const shakeRef = useRef(0);
    useEffect(() => {
        shakeRef.current = shake ?? 0;
    }, [shake]);

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
                root.rotation.x += (baseRot.x - root.rotation.x) * 0.15;
                root.rotation.y += (baseRot.y - root.rotation.y) * 0.15;
                root.rotation.z += (baseRot.z - root.rotation.z) * 0.15;

                const dx = Math.abs(root.rotation.x - baseRot.x);
                const dy = Math.abs(root.rotation.y - baseRot.y);
                const dz = Math.abs(root.rotation.z - baseRot.z);
                needsMoreFrames = dx + dy + dz > 0.0005;
            }

            if (needsMoreFrames) {
                invalidate();
                raf = requestAnimationFrame(loop);
            }
        };

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
            onChange={() => invalidate()}
        />
    );
}

function LocalEnvironment() {
    const gl = useThree((s) => s.gl);
    const envTexture = useMemo(() => {
        const pmrem = new THREE.PMREMGenerator(gl);
        pmrem.compileEquirectangularShader();
        const rt = pmrem.fromScene(new RoomEnvironment(), 0.04);
        pmrem.dispose();
        return rt.texture;
    }, [gl]);

    useEffect(() => {
        return () => {
            envTexture.dispose();
        };
    }, [envTexture]);

    return <primitive attach="environment" object={envTexture} />;
}

function ViewportStabilizer() {
    const gl = useThree((s) => s.gl);
    const camera = useThree((s) => s.camera);
    const invalidate = useThree((s) => s.invalidate);

    useEffect(() => {
        const parent = gl.domElement.parentElement;
        if (!parent) return;

        const syncViewport = () => {
            const width = parent.clientWidth;
            const height = parent.clientHeight;
            if (!width || !height) return;

            gl.setSize(width, height, false);
            if ("aspect" in camera) {
                (camera as THREE.PerspectiveCamera).aspect = width / height;
                (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
            }
            invalidate();
        };

        syncViewport();
        const raf1 = requestAnimationFrame(syncViewport);
        const raf2 = requestAnimationFrame(syncViewport);

        window.addEventListener("load", syncViewport);
        window.addEventListener("resize", syncViewport);

        return () => {
            cancelAnimationFrame(raf1);
            cancelAnimationFrame(raf2);
            window.removeEventListener("load", syncViewport);
            window.removeEventListener("resize", syncViewport);
        };
    }, [gl, camera, invalidate]);

    return null;
}

export function BoosterScene({
    labelUrl,
    backLabelUrl,
    onOpen,
    canOpen = true,
    theme,
    shake = 0,
    resetOrbitKey = 0,
    lockControls = false,
}: {
    labelUrl?: string | null;
    backLabelUrl?: string | null;
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
                dpr={[1, 1.5]}
                gl={{ antialias: false, powerPreference: "high-performance" }}
            >
                <ViewportStabilizer />
                <LocalEnvironment />
                <ambientLight intensity={0.55} />
                <hemisphereLight
                    color="#f4f7ff"
                    groundColor="#464b55"
                    intensity={0.8}
                />
                <directionalLight position={[2.2, 3.2, 2]} intensity={1.25} color="#ffffff" />
                <directionalLight position={[-2.8, 1.8, 1.2]} intensity={0.85} color="#cfe0ff" />
                <directionalLight position={[0.2, 2.4, -2.6]} intensity={0.6} color="#ffe2c7" />

                <Suspense fallback={null}>
                    <BoosterModel
                        labelUrl={labelUrl}
                        backLabelUrl={backLabelUrl}
                        onOpen={onOpen}
                        canOpen={canOpen}
                        theme={theme}
                        shake={shake}
                    />
                </Suspense>

                <Controls key={resetOrbitKey} lockControls={lockControls} />
            </Canvas>
        </div>
    );
}

useGLTF.preload("/models/booster.glb");
