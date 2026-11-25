import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette, ChromaticAberration } from '@react-three/postprocessing';
import type { ChromaticAberrationEffect } from 'postprocessing';
import pointsVert from './shaders/points.vert.glsl?raw';
import pointsFragBody from './shaders/points.frag.glsl?raw';
import shellVert from './shaders/shell.vert.glsl?raw';
import shellFragBody from './shaders/shell.frag.glsl?raw';
import { buildPointCloudData, createCameraRail, createPortraitCameraRail, TENANT_PORTRAIT_Y, TENANT_X } from './beats/beats';
import { QUALITY_SPECS, type FrameGovernor, type QualityTier } from './quality';
import { getSceneState, setSceneState } from './store';

interface LatticeProps {
  tier: QualityTier;
  governor: FrameGovernor;
  onTierChange: (nextTier: QualityTier, nextDpr: number) => void;
}

const COLOR_AMBER = new THREE.Color('#FFB547');
const COLOR_CREAM = new THREE.Color('#F4E9D3');
const COLOR_MIST = new THREE.Color('#7FB8BC');
const COLOR_CORAL = new THREE.Color('#E76F51');

function createDocTexture(): THREE.DataTexture {
  const w = 64;
  const h = 64;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    const isLine = y % 8 >= 2 && y % 8 <= 4 && y > 6 && y < 58;
    for (let x = 0; x < w; x += 1) {
      const idx = (y * w + x) * 4;
      const border = x < 3 || x > w - 4 || y < 3 || y > h - 4;
      const margin = x > 8 && x < w - 10;
      if (border) {
        data[idx] = 255;
        data[idx + 1] = 181;
        data[idx + 2] = 71;
        data[idx + 3] = 210;
      } else if (isLine && margin) {
        data[idx] = 244;
        data[idx + 1] = 233;
        data[idx + 2] = 211;
        data[idx + 3] = 180;
      } else {
        data[idx] = 15;
        data[idx + 1] = 59;
        data[idx + 2] = 63;
        data[idx + 3] = 150;
      }
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
}

export function Lattice({ tier, governor, onTierChange }: LatticeProps) {
  const { camera, gl, scene, invalidate } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const probeRef = useRef<THREE.Mesh>(null);
  const burstRingRef = useRef<THREE.Mesh>(null);
  const canaryRef = useRef<THREE.Mesh>(null);
  const sealRingRef = useRef<THREE.Mesh>(null);
  const instancedRef = useRef<THREE.InstancedMesh>(null);
  const topKRef = useRef<THREE.LineSegments>(null);
  const caRef = useRef<ChromaticAberrationEffect>(null);

  const spec = QUALITY_SPECS[tier];
  const isMobileViewport = typeof window !== 'undefined' && window.innerWidth < 768;
  // ~48% fewer points on mobile so small phone screens stay uncrowded at 60fps
  const pointCount = isMobileViewport ? Math.max(450, Math.round(spec.points * 0.52)) : spec.points;

  // Pre-allocated scratch objects (zero allocations in useFrame)
  const scratchCamPos = useMemo(() => new THREE.Vector3(), []);
  const scratchLookAt = useMemo(() => new THREE.Vector3(), []);
  const scratchDummy = useMemo(() => new THREE.Object3D(), []);
  const scratchCaOffset = useMemo(() => new THREE.Vector2(0, 0), []);
  const smoothedParallax = useRef({ x: 0, y: 0 });
  const smoothedProgress = useRef(0);
  const clockAccum = useRef(0);

  const desktopRail = useMemo(() => createCameraRail(), []);
  const portraitRail = useMemo(() => createPortraitCameraRail(), []);
  const introTimer = useRef(0);
  const introEnabled = useRef(false);

  useEffect(() => {
    const s = getSceneState();
    const played = sessionStorage.getItem('lattice_intro_played') === '1';
    if (!played && !s.reducedMotion && (tier === 'high' || tier === 'mid')) {
      introEnabled.current = true;
      sessionStorage.setItem('lattice_intro_played', '1');
    }
  }, [tier]);

  const pointsFrag = useMemo(
    () => `precision ${spec.fragmentPrecision} float;\n${pointsFragBody}`,
    [spec.fragmentPrecision]
  );
  const shellFrag = useMemo(
    () => `precision ${spec.fragmentPrecision} float;\n${shellFragBody}`,
    [spec.fragmentPrecision]
  );

  // Build point cloud geometry & shader material
  const { pointsGeo, pointsMat, topKGeo, topKMat } = useMemo(() => {
    const cloud = buildPointCloudData(Math.max(1, pointCount));

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(cloud.positions, 3));
    geo.setAttribute('aClusterPos', new THREE.BufferAttribute(cloud.clusterPositions, 3));
    geo.setAttribute('aTenant', new THREE.BufferAttribute(cloud.tenants, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(cloud.seeds, 1));
    geo.setAttribute('aState', new THREE.BufferAttribute(cloud.states, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader: pointsVert,
      fragmentShader: pointsFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uProgress: { value: 0 },
        uLeak: { value: 0 },
        uQuery: { value: 0 },
        uDim: { value: 1 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, spec.dprCap) },
        uReducedMotion: { value: 0 },
        uPointScale: { value: spec.pointScale },
        uMotionAmp: { value: isMobileViewport ? 0.72 : 1.0 },
        uFakeBloom: { value: spec.postprocessing === 'fake-bloom' ? 1.0 : 0.0 },
        uColorA: { value: COLOR_AMBER },
        uColorB: { value: COLOR_CREAM },
        uColorC: { value: COLOR_MIST },
        uColorCoral: { value: COLOR_CORAL },
      },
    });

    const kGeo = new THREE.BufferGeometry();
    kGeo.setAttribute('position', new THREE.BufferAttribute(cloud.topKPositions, 3));
    const kMat = new THREE.LineBasicMaterial({
      color: COLOR_AMBER,
      transparent: true,
      opacity: 0,
    });

    return { pointsGeo: geo, pointsMat: mat, topKGeo: kGeo, topKMat: kMat };
  }, [pointCount, pointsFrag, spec.dprCap, spec.pointScale, spec.postprocessing]);

  // Tenant shell wireframes + Fresnel glass shell for Tenant A
  const { boxEdgesGeo, boxGeo, shellMaterials, glassMat } = useMemo(() => {
    const bGeo = new THREE.BoxGeometry(2.8, 2.8, 2.8);
    const edges = new THREE.EdgesGeometry(bGeo);
    const mats = [COLOR_AMBER, COLOR_CREAM, COLOR_MIST].map(
      (col) =>
        new THREE.LineBasicMaterial({
          color: col,
          transparent: true,
          opacity: 0.78,
        })
    );
    const gMat = new THREE.ShaderMaterial({
      vertexShader: shellVert,
      fragmentShader: shellFrag,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uColor: { value: COLOR_AMBER },
        uCoral: { value: COLOR_CORAL },
        uGlass: { value: 0 },
        uLeak: { value: 0 },
      },
    });
    return { boxEdgesGeo: edges, boxGeo: bGeo, shellMaterials: mats, glassMat: gMat };
  }, [shellFrag]);

  // Instanced document / token quads (RGBA8 <= 64px texture, one draw call)
  const { quadGeo, quadMat, docTex } = useMemo(() => {
    const tex = createDocTexture();
    const g = new THREE.PlaneGeometry(0.42, 0.56);
    const m = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    return { quadGeo: g, quadMat: m, docTex: tex };
  }, []);

  // Probe, burst ring, canary, seal ring
  const { probeGeo, probeMat, ringGeo, ringMat, canaryGeo, canaryMat, sealGeo, sealMat } = useMemo(() => {
    const pGeo = new THREE.SphereGeometry(0.12, 12, 12);
    const pMat = new THREE.MeshBasicMaterial({ color: COLOR_CORAL });
    const rGeo = new THREE.RingGeometry(0.75, 0.83, 36);
    const rMat = new THREE.MeshBasicMaterial({
      color: COLOR_CORAL,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    const cGeo = new THREE.OctahedronGeometry(0.14, 0);
    const cMat = new THREE.MeshBasicMaterial({
      color: COLOR_AMBER,
      transparent: true,
      opacity: 0,
    });
    const sGeo = new THREE.RingGeometry(1.45, 1.56, 48);
    const sMat = new THREE.MeshBasicMaterial({
      color: COLOR_AMBER,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    return {
      probeGeo: pGeo,
      probeMat: pMat,
      ringGeo: rGeo,
      ringMat: rMat,
      canaryGeo: cGeo,
      canaryMat: cMat,
      sealGeo: sGeo,
      sealMat: sMat,
    };
  }, []);

  // Warm up all beat materials during idle BEFORE first reveal (KHR_parallel_shader_compile)
  useEffect(() => {
    let cancelled = false;
    async function warmUp() {
      try {
        if (typeof gl.compileAsync === 'function') {
          await gl.compileAsync(scene, camera);
        } else {
          gl.compile(scene, camera);
        }
      } catch {
        // Fallback: first render compiles shaders
      }
      if (!cancelled) {
        setSceneState({ chunkCount: pointCount, ready: true });
        invalidate();
      }
    }
    void warmUp();
    return () => {
      cancelled = true;
    };
  }, [gl, scene, camera, pointCount, invalidate]);

  // Dispose GPU resources on unmount
  useEffect(() => {
    return () => {
      pointsGeo.dispose();
      pointsMat.dispose();
      topKGeo.dispose();
      topKMat.dispose();
      boxEdgesGeo.dispose();
      boxGeo.dispose();
      shellMaterials.forEach((m) => m.dispose());
      glassMat.dispose();
      quadGeo.dispose();
      quadMat.dispose();
      docTex.dispose();
      probeGeo.dispose();
      probeMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      canaryGeo.dispose();
      canaryMat.dispose();
      sealGeo.dispose();
      sealMat.dispose();
    };
  }, [
    pointsGeo,
    pointsMat,
    topKGeo,
    topKMat,
    boxEdgesGeo,
    boxGeo,
    shellMaterials,
    glassMat,
    quadGeo,
    quadMat,
    docTex,
    probeGeo,
    probeMat,
    ringGeo,
    ringMat,
    canaryGeo,
    canaryMat,
    sealGeo,
    sealMat,
  ]);

  useFrame((_, delta) => {
    const state = getSceneState();
    const dt = Math.min(delta, 0.05);

    // Record frame in adaptive governor
    const gov = governor.recordFrame(dt * 1000);
    if (gov.changed) {
      onTierChange(gov.nextTier, gov.nextDprCap);
    }
    if (gov.avgFps !== state.avgFps) {
      setSceneState({ avgFps: gov.avgFps });
    }

    if (!state.reducedMotion && !state.motionPaused) {
      const speedScale = state.isPortrait || isMobileViewport ? 0.75 : 1.0;
      clockAccum.current += dt * speedScale;
    }

    const targetProg = state.pageMode === 'home' ? state.scrollProgress : 0;
    smoothedProgress.current = state.reducedMotion
      ? targetProg
      : THREE.MathUtils.lerp(smoothedProgress.current, targetProg, 0.12);
    const p = smoothedProgress.current;
    const beat = state.activeBeat;

    // Decay 150ms leak pulse
    if (state.leakPulse > 0) {
      const nextPulse = Math.max(0, state.leakPulse - dt / 0.15);
      setSceneState({ leakPulse: nextPulse });
    }

    const baseMobileDim = state.isPortrait || isMobileViewport ? 0.72 : 1.0;
    const targetDim =
      state.pageMode === 'post'
        ? 0.22
        : state.pageMode === 'blog'
          ? 0.55 * baseMobileDim
          : beat === 8
            ? 0.45 * baseMobileDim
            : baseMobileDim;

    pointsMat.uniforms.uTime!.value = clockAccum.current;
    pointsMat.uniforms.uProgress!.value = p;
    pointsMat.uniforms.uReducedMotion!.value = state.reducedMotion || state.motionPaused ? 1.0 : 0.0;
    pointsMat.uniforms.uPixelRatio!.value = gl.getPixelRatio();
    pointsMat.uniforms.uDim!.value = THREE.MathUtils.lerp(
      pointsMat.uniforms.uDim!.value as number,
      targetDim,
      0.08
    );

    const queryActive =
      beat === 3 || beat === 5 || state.hoverTarget === 'firedamp'
        ? ((clockAccum.current * 0.65) % 1) + 0.02
        : 0;
    pointsMat.uniforms.uQuery!.value = queryActive;

    const leakTarget =
      beat === 6 || state.hoverTarget === 'firedamp' ? 1.0 : beat === 7 ? 0.25 : 0.0;
    pointsMat.uniforms.uLeak!.value = THREE.MathUtils.lerp(
      pointsMat.uniforms.uLeak!.value as number,
      leakTarget,
      0.1
    );

    const glassTarget = beat === 5 || beat === 6 ? 1.0 : 0.0;
    glassMat.uniforms.uGlass!.value = THREE.MathUtils.lerp(
      glassMat.uniforms.uGlass!.value as number,
      glassTarget,
      0.1
    );
    glassMat.uniforms.uLeak!.value = pointsMat.uniforms.uLeak!.value;

    if (topKRef.current) {
      topKMat.opacity = THREE.MathUtils.lerp(topKMat.opacity, beat === 3 ? 0.85 : 0.0, 0.12);
    }

    if (canaryRef.current) {
      const canaryVisible = beat >= 4 && beat <= 6 ? 1.0 : 0.0;
      canaryMat.opacity = THREE.MathUtils.lerp(canaryMat.opacity, canaryVisible, 0.12);
      canaryRef.current.rotation.y = clockAccum.current * 1.4;
    }

    if (sealRingRef.current) {
      const sealTarget = beat === 7 ? 0.9 : 0.0;
      sealMat.opacity = THREE.MathUtils.lerp(sealMat.opacity, sealTarget, 0.1);
      const scale = beat === 7 ? 1.0 + Math.sin(clockAccum.current * 2.0) * 0.04 : 0.7;
      sealRingRef.current.scale.setScalar(scale);
    }

    if (probeRef.current && burstRingRef.current) {
      const showProbe =
        state.pageMode === 'home' &&
        (beat === 0 || beat === 5 || beat === 6 || state.hoverTarget === 'firedamp' || state.tapTenantBurst >= 0);
      if (!showProbe) {
        probeRef.current.visible = false;
        burstRingRef.current.visible = false;
      } else {
        const cycle = state.reducedMotion ? 0.45 : (clockAccum.current * 0.34) % 1;
        if (cycle < 0.62) {
          probeRef.current.visible = true;
          burstRingRef.current.visible = false;
          const t = cycle / 0.62;
          probeRef.current.position.set(THREE.MathUtils.lerp(-0.2, -2.5, t), 0, 0);
        } else {
          probeRef.current.visible = false;
          burstRingRef.current.visible = true;
          const t = (cycle - 0.62) / 0.38;
          burstRingRef.current.scale.setScalar(0.8 + t * 1.6);
          ringMat.opacity = (1 - t) * 0.9;
        }
      }
    }

    if (instancedRef.current) {
      const count = 32;
      const showSheets = state.pageMode === 'home' && (beat === 1 || beat === 2 || beat === 9);
      instancedRef.current.visible = showSheets;
      if (showSheets) {
        for (let i = 0; i < count; i += 1) {
          const frac = i / count;
          if (beat === 9) {
            const flow = (frac + clockAccum.current * 0.08) % 1;
            scratchDummy.position.set(
              THREE.MathUtils.lerp(-5.5, 5.5, flow),
              Math.sin(flow * Math.PI * 2 + i) * 0.6 - 1.2,
              Math.cos(flow * Math.PI * 2) * 1.4
            );
            scratchDummy.rotation.set(0.2, flow * Math.PI, 0);
            scratchDummy.scale.setScalar(0.55);
          } else {
            const glide = THREE.MathUtils.clamp((p - 0.1) / 0.14, 0, 1);
            scratchDummy.position.set(
              -3.9 + (frac - 0.5) * 1.8 * (1 - glide * 0.4),
              THREE.MathUtils.lerp(2.4, (frac - 0.5) * 1.6, glide),
              ((i % 4) - 1.5) * 0.55
            );
            scratchDummy.rotation.set(0.15 * (1 - glide), frac * 0.8, 0);
            scratchDummy.scale.setScalar(1.0 - glide * 0.45);
          }
          scratchDummy.updateMatrix();
          instancedRef.current.setMatrixAt(i, scratchDummy.matrix);
        }
        instancedRef.current.instanceMatrix.needsUpdate = true;
      }
    }

    const rail = state.isPortrait ? portraitRail : desktopRail;
    rail.positionCurve.getPointAt(p, scratchCamPos);
    rail.lookAtCurve.getPointAt(p, scratchLookAt);

    // First-visit 1.2s camera dolly
    if (introEnabled.current && introTimer.current < 1.2) {
      introTimer.current += dt;
      const dollyT = Math.min(1, introTimer.current / 1.2);
      const easeOut = 1 - Math.pow(1 - dollyT, 3);
      scratchCamPos.z += (1 - easeOut) * 3.5;
    }

    // Portrait recomposition: FOV 55, vertical stack & 0.65 scale
    const persp = camera as THREE.PerspectiveCamera;
    const targetFov = state.isPortrait ? 55 : 45;
    if (Math.abs(persp.fov - targetFov) > 0.1) {
      persp.fov = targetFov;
      persp.updateProjectionMatrix();
    }
    if (groupRef.current) {
      const targetScale = state.isPortrait ? 0.65 : 1.0;
      groupRef.current.scale.setScalar(targetScale);
    }

    // Combine gyroscope (+/-3 deg) or pointer/touch (+/-2 deg)
    const maxRad = (3 * Math.PI) / 180;
    const inputX = state.gyroX !== 0 ? state.gyroX : state.pointerX * (2 / 3);
    const inputY = state.gyroY !== 0 ? state.gyroY : state.pointerY * (2 / 3);
    smoothedParallax.current.x = THREE.MathUtils.lerp(
      smoothedParallax.current.x,
      THREE.MathUtils.clamp(inputX, -1, 1) * maxRad,
      0.08
    );
    smoothedParallax.current.y = THREE.MathUtils.lerp(
      smoothedParallax.current.y,
      THREE.MathUtils.clamp(inputY, -1, 1) * maxRad,
      0.08
    );

    camera.position.copy(scratchCamPos);
    camera.lookAt(scratchLookAt);
    camera.rotation.y += smoothedParallax.current.x;
    camera.rotation.x += smoothedParallax.current.y;

    if (caRef.current) {
      const caAmount = state.leakPulse * 0.0045;
      scratchCaOffset.set(caAmount, caAmount * 0.5);
      caRef.current.offset = scratchCaOffset;
    }
  });

  const state = getSceneState();
  const enableHighPost =
    spec.postprocessing === 'bloom-vignette' && !state.reducedMotion && state.pageMode !== 'post';

  return (
    <>
      <group ref={groupRef}>
        {TENANT_X.map((x, idx) => (
          <group
            key={x}
            position={state.isPortrait ? [0, TENANT_PORTRAIT_Y[idx]!, 0] : [x, 0, 0]}
          >
            <lineSegments geometry={boxEdgesGeo} material={shellMaterials[idx]} />
            {idx === 0 && <mesh geometry={boxGeo} material={glassMat} />}
          </group>
        ))}

        <points geometry={pointsGeo} material={pointsMat} frustumCulled={false} />
        <lineSegments ref={topKRef} geometry={topKGeo} material={topKMat} />

        <mesh
          ref={canaryRef}
          position={[TENANT_X[0] + 0.65, 0.35, 0.2]}
          geometry={canaryGeo}
          material={canaryMat}
        />

        <mesh
          ref={sealRingRef}
          position={[TENANT_X[0] + 1.42, 0, 0]}
          rotation={[0, Math.PI / 2, 0]}
          geometry={sealGeo}
          material={sealMat}
        />

        <mesh ref={probeRef} geometry={probeGeo} material={probeMat} />
        <mesh
          ref={burstRingRef}
          position={[TENANT_X[0] + 1.42, 0, 0]}
          rotation={[0, Math.PI / 2, 0]}
          geometry={ringGeo}
          material={ringMat}
        />

        <instancedMesh ref={instancedRef} args={[quadGeo, quadMat, 32]} frustumCulled={false} />
      </group>

      {enableHighPost && (
        <EffectComposer multisampling={0}>
          <Bloom
            intensity={0.36}
            luminanceThreshold={0.85}
            luminanceSmoothing={0.2}
            mipmapBlur
          />
          <Vignette eskil={false} offset={0.22} darkness={0.45} />
          <ChromaticAberration
            ref={caRef}
            offset={scratchCaOffset}
            radialModulation={false}
            modulationOffset={0.15}
          />
        </EffectComposer>
      )}
    </>
  );
}
