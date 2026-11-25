import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { Lattice } from './Lattice';
import { initScrollChoreography, destroyScrollChoreography } from './beats/scrollChoreography';
import { startHudLoop, stopHudLoop } from './hud';
import { detectInitialTier, FrameGovernor, QUALITY_SPECS, type QualityTier } from './quality';
import { getSceneState, setSceneState } from './store';

function DemandDriver({
  governor,
}: {
  governor: FrameGovernor;
}) {
  const { invalidate } = useThree();

  useEffect(() => {
    let rafId = 0;
    let lastDraw = 0;

    const loop = (now: number) => {
      const s = getSceneState();
      if (!s.isHidden && s.stageVisible && !s.contextLost && !s.reducedMotion && !s.motionPaused) {
        const targetFps = governor.getTargetFps(now, s.activeBeat === 0 && s.pageMode === 'home');
        const minInterval = targetFps > 0 ? 1000 / targetFps : 1000;
        if (now - lastDraw >= minInterval) {
          lastDraw = now;
          invalidate();
        }
      }
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [governor, invalidate]);

  return null;
}

export default function LatticeCanvas() {
  const [tier, setTier] = useState<QualityTier>('static');
  const [dpr, setDpr] = useState<number>(1.5);
  const [contextLost, setContextLost] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const governor = useMemo(() => new FrameGovernor('mid'), []);

  const applyTier = useCallback(
    (nextTier: QualityTier, nextDpr?: number) => {
      const spec = QUALITY_SPECS[nextTier];
      const mobileCap = window.innerWidth < 768 ? 1.5 : spec.dprCap;
      const resolvedDpr = Math.min(window.devicePixelRatio || 1, nextDpr ?? spec.dprCap, mobileCap);
      governor.setTier(nextTier);
      setTier(nextTier);
      setDpr(resolvedDpr);
      setSceneState({ tier: nextTier, dpr: resolvedDpr, chunkCount: spec.points });
    },
    [governor]
  );

  useEffect(() => {
    let mounted = true;

    async function boot(forceOptIn = false) {
      const detected = await detectInitialTier(forceOptIn);
      if (!mounted) return;
      applyTier(detected.tier);
    }

    void boot(getSceneState().manualOptIn);

    const onEnter3D = () => {
      setSceneState({ manualOptIn: true });
      void boot(true);
    };

    const onSetTier = (e: Event) => {
      const custom = e as CustomEvent<{ tier: QualityTier }>;
      if (custom.detail?.tier) {
        applyTier(custom.detail.tier);
      }
    };

    const onInput = () => governor.notifyInput();

    window.addEventListener('lattice:enter-3d', onEnter3D);
    window.addEventListener('lattice:set-tier', onSetTier);
    window.addEventListener('scroll', onInput, { passive: true });
    window.addEventListener('pointerdown', onInput, { passive: true });
    window.addEventListener('touchstart', onInput, { passive: true });

    const cleanupChoreo = initScrollChoreography();
    const cleanupHud = startHudLoop();

    const onSwap = () => {
      initScrollChoreography();
      startHudLoop();
    };
    document.addEventListener('astro:after-swap', onSwap);

    // Stage IntersectionObserver for frameloop="demand"
    let io: IntersectionObserver | null = null;
    if (wrapRef.current) {
      io = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (entry) {
            setSceneState({ stageVisible: entry.isIntersecting });
          }
        },
        { threshold: 0.01 }
      );
      io.observe(wrapRef.current);
    }

    return () => {
      mounted = false;
      window.removeEventListener('lattice:enter-3d', onEnter3D);
      window.removeEventListener('lattice:set-tier', onSetTier);
      window.removeEventListener('scroll', onInput);
      window.removeEventListener('pointerdown', onInput);
      window.removeEventListener('touchstart', onInput);
      document.removeEventListener('astro:after-swap', onSwap);
      io?.disconnect();
      destroyScrollChoreography();
      stopHudLoop();
      cleanupChoreo();
      cleanupHud();
    };
  }, [applyTier, governor]);

  if (tier === 'static' || contextLost) {
    return null;
  }

  const spec = QUALITY_SPECS[tier];

  return (
    <div ref={wrapRef} className="lattice-canvas-wrap" aria-hidden="true">
      <Canvas
        dpr={dpr}
        frameloop="demand"
        camera={{ position: [2.2, 1.1, 12.2], fov: 45, near: 0.1, far: 100 }}
        gl={{
          antialias: spec.antialias,
          alpha: true,
          powerPreference: 'high-performance',
          preserveDrawingBuffer: false,
          toneMapping: THREE.NoToneMapping,
        }}
        onCreated={({ gl }) => {
          const canvas = gl.domElement;
          canvas.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            setContextLost(true);
            setSceneState({ contextLost: true });
          });
          canvas.addEventListener('webglcontextrestored', () => {
            setContextLost(false);
            setSceneState({ contextLost: false });
          });
        }}
      >
        <DemandDriver governor={governor} />
        <Lattice tier={tier} governor={governor} onTierChange={applyTier} />
      </Canvas>
    </div>
  );
}
