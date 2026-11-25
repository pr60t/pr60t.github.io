import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { isLandscapeCompactViewport, isPortraitViewport } from '../device';
import { triggerBeatHaptic, triggerLeakHaptic } from '../haptics';
import { getSceneState, setSceneState, type PageMode } from '../store';
import { resolveBeat } from './beats';

gsap.registerPlugin(ScrollTrigger);

let lenisInstance: Lenis | null = null;
let rafId: number | null = null;
let mainTrigger: ScrollTrigger | null = null;
let cleanupListeners: (() => void) | null = null;

function detectPageMode(): PageMode {
  const path = window.location.pathname;
  if (path === '/' || path === '/index.html') return 'home';
  if (
    path.startsWith('/blog/') &&
    path !== '/blog/' &&
    !path.startsWith('/blog/page/') &&
    !path.startsWith('/blog/tags/')
  ) {
    return 'post';
  }
  return 'blog';
}

function updateTelemetryForBeat(beatIndex: number, progress: number): void {
  const state = getSceneState();
  const hoverBonus = state.hoverTarget === 'firedamp' ? state.hoverPulse : 0;

  let tenant: 'A' | 'B' | 'C' | 'A -> B' = 'A';
  let cosine = 0.83;
  let leaks = 0;
  let answer = false;
  let citations = false;
  let rawApi = false;
  let sarifVisible = false;

  if (beatIndex === 2) {
    cosine = 0.78 + Math.min(0.09, (progress - 0.22) * 0.5);
  } else if (beatIndex === 3) {
    cosine = 0.89;
  } else if (beatIndex === 4) {
    tenant = 'A';
    cosine = 0.91;
  } else if (beatIndex === 5) {
    tenant = 'A -> B';
    cosine = 0.86;
  } else if (beatIndex === 6) {
    tenant = 'A -> B';
    cosine = 0.94;
    leaks = 1;
    answer = true;
    citations = true;
    rawApi = true;
  } else if (beatIndex === 7) {
    tenant = 'A';
    cosine = 0.94;
    leaks = 1;
    answer = true;
    citations = true;
    rawApi = true;
    sarifVisible = true;
  } else if (hoverBonus > 0.2) {
    tenant = 'A -> B';
    leaks = 1;
    answer = true;
    citations = true;
    rawApi = true;
  }

  const prevBeat = state.activeBeat;
  if (beatIndex !== prevBeat) {
    if (beatIndex === 6) {
      triggerLeakHaptic();
    } else {
      triggerBeatHaptic();
    }
  }

  const leakPulse = beatIndex === 6 && prevBeat !== 6 ? 1.0 : state.leakPulse;

  setSceneState({
    scrollProgress: progress,
    activeBeat: beatIndex,
    beatLabel: resolveBeat(progress).label,
    tenant,
    cosine: Number(cosine.toFixed(2)),
    leaks,
    leakPulse,
    channels: { answer, citations, rawApi },
    sarifVisible,
  });
}

export function initScrollChoreography(): () => void {
  destroyScrollChoreography();

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  const pageMode = detectPageMode();

  setSceneState({
    reducedMotion,
    pageMode,
    isPortrait: isPortraitViewport(),
    isLandscapeCompact: isLandscapeCompactViewport(),
  });

  if (pageMode !== 'home') {
    setSceneState({
      scrollProgress: 0,
      activeBeat: 0,
      beatLabel: pageMode === 'post' ? 'AMBIENT / READING' : 'LOG / LATTICE',
      sarifVisible: false,
      channels: { answer: false, citations: false, rawApi: false },
      leaks: 0,
    });
  }

  // Lenis ONLY on desktop fine-pointer; native momentum on Android touch
  if (!reducedMotion && !isTouch) {
    lenisInstance = new Lenis({
      duration: 1.1,
      smoothWheel: true,
      syncTouch: false,
    });
    lenisInstance.on('scroll', ScrollTrigger.update);

    const tick = (time: number) => {
      lenisInstance?.raf(time);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  if (pageMode === 'home') {
    mainTrigger = ScrollTrigger.create({
      trigger: document.body,
      start: 'top top',
      end: 'bottom bottom',
      scrub: reducedMotion ? false : 0.3,
      onUpdate: (self) => {
        const beat = resolveBeat(self.progress);
        updateTelemetryForBeat(beat.index, self.progress);
      },
    });
  }

  // Pointer parallax (desktop)
  const onPointerMove = (e: PointerEvent) => {
    if (getSceneState().reducedMotion || e.pointerType === 'touch') return;
    const x = (e.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
    const y = (e.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
    setSceneState({ pointerX: x, pointerY: y });
  };
  window.addEventListener('pointermove', onPointerMove, { passive: true });

  // Gyroscope parallax (+/-3 deg) with low-pass filter
  let lpX = 0;
  let lpY = 0;
  const onOrientation = (e: DeviceOrientationEvent) => {
    const s = getSceneState();
    if (s.reducedMotion || s.tier === 'static') return;
    if (e.gamma === null || e.beta === null) return;
    const normX = Math.max(-1, Math.min(1, e.gamma / 30));
    const normY = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
    lpX = lpX * 0.85 + normX * 0.15;
    lpY = lpY * 0.85 + normY * 0.15;
    setSceneState({ gyroX: lpX, gyroY: lpY });
  };
  window.addEventListener('deviceorientation', onOrientation, { passive: true });

  // Touch-drag parallax fallback + tap-to-burst + 450ms long-press to pin HUD
  // Respects 24px edge exclusion for Android system back gesture
  const stageEl = document.getElementById('sticky-stage') ?? document.body;
  let touchStartX = 0;
  let touchStartY = 0;
  let longPressTimer: number | null = null;
  let touchMoved = false;

  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    // Do not intercept system back-swipe within 24dp of screen edges
    if (t.clientX < 24 || t.clientX > window.innerWidth - 24) return;

    touchStartX = t.clientX;
    touchStartY = t.clientY;
    touchMoved = false;

    longPressTimer = window.setTimeout(() => {
      if (!touchMoved) {
        const pinned = !getSceneState().hudPinned;
        setSceneState({ hudPinned: pinned });
        triggerBeatHaptic();
      }
    }, 450);
  };

  const onTouchMove = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    if (Math.abs(t.clientX - touchStartX) > 10 || Math.abs(t.clientY - touchStartY) > 10) {
      touchMoved = true;
      if (longPressTimer !== null) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    }
    if (!getSceneState().reducedMotion && getSceneState().gyroX === 0) {
      const dx = (t.clientX - touchStartX) / Math.max(120, window.innerWidth * 0.4);
      const dy = (t.clientY - touchStartY) / Math.max(120, window.innerHeight * 0.4);
      setSceneState({
        pointerX: Math.max(-1, Math.min(1, dx)),
        pointerY: Math.max(-1, Math.min(1, dy)),
      });
    }
  };

  const onTouchEnd = () => {
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    if (!touchMoved) {
      // Tap stage -> fire probe/burst
      setSceneState({ tapTenantBurst: 0, leakPulse: 1.0 });
      triggerBeatHaptic();
      window.setTimeout(() => setSceneState({ tapTenantBurst: -1 }), 1400);
    }
  };

  stageEl.addEventListener('touchstart', onTouchStart, { passive: true });
  stageEl.addEventListener('touchmove', onTouchMove, { passive: true });
  stageEl.addEventListener('touchend', onTouchEnd, { passive: true });

  // Hover triggers on project cards (desktop)
  const firedampEl = document.querySelector<HTMLElement>('[data-scene-hover="firedamp"]');
  const chronaEl = document.querySelector<HTMLElement>('[data-scene-hover="chrona"]');

  const onEnterFiredamp = () => {
    setSceneState({ hoverTarget: 'firedamp', hoverPulse: 1, leakPulse: 1 });
  };
  const onLeaveCard = () => {
    setSceneState({ hoverTarget: 'none', hoverPulse: 0 });
  };
  const onEnterChrona = () => {
    setSceneState({ hoverTarget: 'chrona', hoverPulse: 0.6 });
  };

  firedampEl?.addEventListener('pointerenter', onEnterFiredamp);
  firedampEl?.addEventListener('pointerleave', onLeaveCard);
  chronaEl?.addEventListener('pointerenter', onEnterChrona);
  chronaEl?.addEventListener('pointerleave', onLeaveCard);

  const onResizeOrOrient = () => {
    setSceneState({
      isPortrait: isPortraitViewport(),
      isLandscapeCompact: isLandscapeCompactViewport(),
    });
    ScrollTrigger.refresh();
  };
  window.addEventListener('resize', onResizeOrOrient, { passive: true });
  window.addEventListener('orientationchange', onResizeOrOrient, { passive: true });

  const onVisibility = () => {
    setSceneState({ isHidden: document.hidden });
  };
  document.addEventListener('visibilitychange', onVisibility);

  cleanupListeners = () => {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('deviceorientation', onOrientation);
    stageEl.removeEventListener('touchstart', onTouchStart);
    stageEl.removeEventListener('touchmove', onTouchMove);
    stageEl.removeEventListener('touchend', onTouchEnd);
    firedampEl?.removeEventListener('pointerenter', onEnterFiredamp);
    firedampEl?.removeEventListener('pointerleave', onLeaveCard);
    chronaEl?.removeEventListener('pointerenter', onEnterChrona);
    chronaEl?.removeEventListener('pointerleave', onLeaveCard);
    window.removeEventListener('resize', onResizeOrOrient);
    window.removeEventListener('orientationchange', onResizeOrOrient);
    document.removeEventListener('visibilitychange', onVisibility);
  };

  return destroyScrollChoreography;
}

export function destroyScrollChoreography(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (mainTrigger) {
    mainTrigger.kill();
    mainTrigger = null;
  }
  if (lenisInstance) {
    lenisInstance.destroy();
    lenisInstance = null;
  }
  if (cleanupListeners) {
    cleanupListeners();
    cleanupListeners = null;
  }
}
