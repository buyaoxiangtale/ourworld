import { createPlanetIcon, planetRotationMs } from './planet-icons';

const miniatureFrameInterval = 1000 / 30 - 1; // Tolerate display-frame timestamp rounding.

export async function mountMiniature(
  host: HTMLElement,
  fallback: HTMLElement,
  textures?: URL,
  signal?: AbortSignal,
) {
  const model = await createPlanetIcon('earth', false, textures);
  if (signal?.aborted) {
    model.dispose();
    return;
  }
  const { canvas } = model;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;
  let previousTime: number | undefined;
  let turn = 0;
  let active = true;
  let contextLost = false;

  function showGlobe(visible: boolean) {
    fallback.hidden = visible;
    canvas.hidden = !visible;
  }

  function resize() {
    const size = Math.max(1, Math.min(host.clientWidth, host.clientHeight));
    model.resize(size, Math.min(devicePixelRatio, 3));
    if (!contextLost) model.render(turn);
  }

  function render(time: number) {
    frame = requestAnimationFrame(render);
    // The small nav icon needs fewer GPU updates than the interactive globe.
    const elapsed = previousTime === undefined ? 0 : time - previousTime;
    if (previousTime !== undefined && elapsed < miniatureFrameInterval) return;
    turn = (turn + elapsed / planetRotationMs) % 1;
    previousTime = time;
    model.render(turn);
  }

  function sync() {
    cancelAnimationFrame(frame);
    previousTime = undefined;
    if (motion.matches && !contextLost) model.render(0);
    if (active && !contextLost && !document.hidden && !motion.matches) frame = requestAnimationFrame(render);
  }

  function loseContext(event: Event) {
    event.preventDefault();
    contextLost = true;
    showGlobe(false);
    sync();
  }

  function restoreContext() {
    contextLost = false;
    resize();
    showGlobe(true);
    sync();
  }

  const observer = new ResizeObserver(resize);
  canvas.addEventListener('webglcontextlost', loseContext);
  canvas.addEventListener('webglcontextrestored', restoreContext);
  document.addEventListener('visibilitychange', sync);
  motion.addEventListener('change', sync);
  signal?.addEventListener('abort', () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    canvas.removeEventListener('webglcontextlost', loseContext);
    canvas.removeEventListener('webglcontextrestored', restoreContext);
    document.removeEventListener('visibilitychange', sync);
    motion.removeEventListener('change', sync);
    canvas.remove();
    fallback.hidden = false;
    model.dispose();
  }, { once: true });
  host.append(canvas);
  observer.observe(host);
  resize();
  showGlobe(true);
  sync();
  return (value: boolean) => { active = value; sync(); };
}
