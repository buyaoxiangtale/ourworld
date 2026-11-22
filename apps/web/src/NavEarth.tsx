import { useEffect, useRef } from 'react';

export function NavEarth() {
  const host = useRef<HTMLSpanElement>(null);
  const fallback = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const surface = host.current;
    const atlas = fallback.current;
    if (!surface || !atlas) return;
    const lifetime = new AbortController();
    void import('../../../packages/globe/src/mount-miniature').then(({ mountMiniature }) => {
      if (!lifetime.signal.aborted) {
        return mountMiniature(surface, atlas, new URL('/globe/textures/', location.href), lifetime.signal);
      }
    }).catch(() => { /* The rotating atlas is already in the button. */ });
    return () => lifetime.abort();
  }, []);

  return <span ref={host} className="nav-earth" aria-hidden="true">
    <span ref={fallback} className="planet-atlas" data-planet="earth" />
  </span>;
}
