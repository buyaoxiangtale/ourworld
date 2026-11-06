import { AmbientLight, Color, DirectionalLight, SRGBColorSpace, type PerspectiveCamera, type Scene } from 'three';
import type { MeshPhongMaterial } from 'three';
import { theme } from './theme';

/**
 * Photographic blue-marble appearance. The NASA day imagery carries the colour,
 * the GEBCO grayscale (loaded through globe.gl's bumpImageUrl) adds relief depth,
 * and a viewer-following key light keeps the whole disc evenly readable with no
 * sun-dependent terminator. Country plates stay on globe.gl's polygon layer.
 */
export interface EarthAppearance {
  lights: (AmbientLight|DirectionalLight)[];
  /** Parent the key light to the camera so relief shading stays view-relative. */
  attachTo: (scene: Scene, camera: PerspectiveCamera) => void;
  /** Tune the Phong material globe.gl builds from our texture URLs. */
  configure: (material: MeshPhongMaterial, maxAnisotropy: number) => void;
}
export function createEarthAppearance(): EarthAppearance {
  const ambient = new AmbientLight(0xffffff, 1.45);
  const key = new DirectionalLight(0xffffff, 1.2);
  key.position.set(60, 90, 240); // direction only: from the viewer's upper front toward the globe centre
  const attachTo = (scene: Scene, camera: PerspectiveCamera) => { camera.add(key); scene.add(camera); };
  const configure = (material: MeshPhongMaterial, maxAnisotropy: number) => {
    if (material.map) { material.map.colorSpace = SRGBColorSpace; material.map.anisotropy = Math.min(maxAnisotropy, 4); }
    if (material.bumpMap) { material.bumpMap.anisotropy = Math.min(maxAnisotropy, 4); material.bumpScale = .6; }
    material.shininess = 3.5;
    material.specular = new Color(theme.seaShelf);
  };
  return { lights: [ambient, key], attachTo, configure };
}
