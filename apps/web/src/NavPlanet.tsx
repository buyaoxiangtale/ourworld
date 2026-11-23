import { useEffect, useState, type Ref } from 'react';
import earth from './assets/planet-icons/earth.webp?inline';
import community from './assets/planet-icons/community.webp?inline';
import chat from './assets/planet-icons/chat.webp?inline';
import profile from './assets/planet-icons/profile.webp?inline';

const stills = { earth, community, chat, profile };

export function NavPlanet({ kind, animated, elementRef }: {
  kind: keyof typeof stills;
  animated: boolean;
  elementRef?: Ref<HTMLSpanElement>;
}) {
  const [atlasReady, setAtlasReady] = useState(false);

  useEffect(() => {
    if (!animated) return;

    const image = new Image();
    image.src = `/globe/textures/planet-${kind}.png`;
    let disposed = false;
    void image.decode().then(() => {
      if (!disposed) setAtlasReady(true);
    }).catch(() => { /* Keep the still if the atlas fails to load. */ });
    return () => { disposed = true; };
  }, [animated, kind]);

  return <span ref={elementRef} className="planet-atlas" data-planet={kind} aria-hidden="true"
    style={animated && atlasReady ? undefined : {
      background: `url("${stills[kind]}") center / contain no-repeat`,
      animation: 'none',
    }} />;
}
