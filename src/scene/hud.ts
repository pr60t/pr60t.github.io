import { getSceneState } from './store';

let hudRaf: number | null = null;

export function startHudLoop(): () => void {
  stopHudLoop();

  const hudRoot = document.getElementById('lattice-hud');
  const beatEl = document.getElementById('hud-beat');
  const tenantEl = document.getElementById('hud-tenant');
  const chunksEl = document.getElementById('hud-chunks');
  const kEl = document.getElementById('hud-k');
  const cosineEl = document.getElementById('hud-cosine');
  const leaksEl = document.getElementById('hud-leaks');
  const chAnswer = document.getElementById('hud-ch-answer');
  const chCitations = document.getElementById('hud-ch-citations');
  const chRaw = document.getElementById('hud-ch-raw');
  const sarifCard = document.getElementById('hud-sarif');
  const mobileChip = document.getElementById('hud-mobile-chip');
  const beatTicks = document.querySelectorAll<HTMLElement>('[data-beat-tick]');
  const announcer = document.getElementById('beat-announcer');

  if (!hudRoot) return () => {};

  let lastAnnouncedBeat = -1;
  let lastAnnounceAt = 0;

  const tick = () => {
    // Skip hidden mobile HUD DOM writes on <768px; keep 3D scene store intact
    if (window.innerWidth < 768) {
      hudRaf = requestAnimationFrame(tick);
      return;
    }

    const s = getSceneState();
    const now = performance.now();

    if (announcer && s.pageMode === 'home' && s.activeBeat !== lastAnnouncedBeat && now - lastAnnounceAt >= 800) {
      lastAnnouncedBeat = s.activeBeat;
      lastAnnounceAt = now;
      announcer.textContent = s.beatLabel;
    }

    if (s.tier === 'static' || s.pageMode === 'post') {
      hudRoot.dataset.visible = 'false';
    } else {
      hudRoot.dataset.visible = 'true';
    }
    hudRoot.dataset.pinned = String(s.hudPinned);

    if (beatEl) beatEl.textContent = s.beatLabel;
    if (tenantEl) tenantEl.textContent = s.tenant;
    if (chunksEl) chunksEl.textContent = s.chunkCount.toLocaleString('en-US');
    if (kEl) kEl.textContent = String(s.topK);
    if (cosineEl) cosineEl.textContent = s.cosine.toFixed(2);
    if (leaksEl) {
      leaksEl.textContent = String(s.leaks);
      leaksEl.dataset.alert = s.leaks > 0 ? 'true' : 'false';
    }

    if (mobileChip) {
      mobileChip.textContent = `// ${s.beatLabel}  k=${s.topK}  cos ${s.cosine.toFixed(2)}`;
    }

    beatTicks.forEach((tickEl) => {
      const idx = Number(tickEl.dataset.beatTick);
      tickEl.dataset.active = String(idx === s.activeBeat);
    });

    if (chAnswer) chAnswer.dataset.active = String(s.channels.answer);
    if (chCitations) chCitations.dataset.active = String(s.channels.citations);
    if (chRaw) chRaw.dataset.active = String(s.channels.rawApi);
    if (sarifCard) sarifCard.dataset.visible = String(s.sarifVisible);

    hudRaf = requestAnimationFrame(tick);
  };

  hudRaf = requestAnimationFrame(tick);
  return stopHudLoop;
}

export function stopHudLoop(): void {
  if (hudRaf !== null) {
    cancelAnimationFrame(hudRaf);
    hudRaf = null;
  }
}
