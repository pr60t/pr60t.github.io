import { lazy, Suspense, useEffect, useState } from 'react';
import { getDeviceSnapshot } from './device';
import { setSceneState } from './store';

const LazyCanvas = lazy(() => import('./Canvas'));

export default function DeferredCanvas() {
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const snap = getDeviceSnapshot();
    const slowNet =
      snap.effectiveType === '2g' ||
      snap.effectiveType === '3g' ||
      snap.effectiveType === 'slow-2g';

    // Never autoload WebGL on metered connections, Save-Data, or reduced-motion
    if (!snap.hasWebGL2 || snap.saveData || snap.reducedData || slowNet || snap.reducedMotion) {
      setSceneState({ tier: 'static', ready: true });
      const onEnter = () => {
        setSceneState({ manualOptIn: true });
        setShouldLoad(true);
      };
      window.addEventListener('lattice:enter-3d', onEnter, { once: true });
      return () => window.removeEventListener('lattice:enter-3d', onEnter);
    }

    let cancelled = false;
    const loadAfterLcp = () => {
      if (!cancelled) setShouldLoad(true);
    };

    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (typeof win.requestIdleCallback === 'function') {
      const id = win.requestIdleCallback(loadAfterLcp, { timeout: 1200 });
      return () => {
        cancelled = true;
        win.cancelIdleCallback?.(id);
      };
    }

    const timer = window.setTimeout(loadAfterLcp, 1200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  if (!shouldLoad) return null;

  return (
    <Suspense fallback={null}>
      <LazyCanvas />
    </Suspense>
  );
}
