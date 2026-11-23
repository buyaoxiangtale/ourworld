import { useEffect, useRef } from 'react';
import { NavPlanet } from './NavPlanet';

export function NavEarth({ animated }: { animated: boolean }) {
  const host = useRef<HTMLSpanElement>(null);
  const fallback = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!animated) return;
    const surface = host.current;
    const atlas = fallback.current;
    if (!surface || !atlas) return;
    const lifetime = new AbortController();
    void import('../../../packages/globe/src/mount-miniature').then(({ mountMiniature }) => {
      if (!lifetime.signal.aborted) {
        return mountMiniature(surface, atlas, new URL('/globe/textures/', location.href), lifetime.signal);
      }
    }).catch(() => { /* Keep the existing icon if WebGL is unavailable. */ });
    return () => lifetime.abort();
  }, [animated]);

  return <span ref={host} className="nav-earth" aria-hidden="true">
    <NavPlanet kind="earth" animated={animated} elementRef={fallback} />
  </span>;
}
