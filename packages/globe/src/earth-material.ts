import {
  AdditiveBlending, AmbientLight, BackSide, CanvasTexture, Color, Mesh,
  ShaderMaterial, SphereGeometry, SRGBColorSpace, TextureLoader,
} from 'three';
import { geoEquirectangular, geoPath } from 'd3-geo';
import type { FeatureCollection, Geometry } from 'geojson';
import { theme } from './theme';

/**
 * Photographic globe: the day texture carries the colour and the shader only deepens
 * the sea and shades the terrain. Country plates are drawn by globe.gl's polygon
 * layer, so the mask keeps a single job - separating land from water.
 */
export async function createEarthAppearance(countries: FeatureCollection<Geometry>) {
  const day = await new TextureLoader().loadAsync(new URL('textures/earth-day.jpg', document.baseURI).href);
  day.colorSpace = SRGBColorSpace;
  const canvas = document.createElement('canvas');
  canvas.width = 2048; canvas.height = 1024;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Map canvas unavailable');
  context.fillStyle = '#000000'; context.fillRect(0, 0, canvas.width, canvas.height);
  const projection = geoEquirectangular().translate([canvas.width / 2, canvas.height / 2]).scale(canvas.width / (2 * Math.PI));
  const path = geoPath(projection, context);
  context.beginPath(); path(countries); context.fillStyle = '#ff0000'; context.fill();
  const mask = new CanvasTexture(canvas);
  const earth = new ShaderMaterial({
    uniforms: {
      uSurface: { value: day }, uMask: { value: mask },
      uOcean: { value: new Color(theme.sea) }, uShelf: { value: new Color(theme.seaShelf) },
      uLand: { value: new Color(theme.land) }, uHighland: { value: new Color(theme.highland) },
    },
    vertexShader: `
      varying vec2 vMapUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      void main() {
        vMapUv = uv;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uSurface;
      uniform sampler2D uMask;
      uniform vec3 uOcean, uShelf, uLand, uHighland;
      varying vec2 vMapUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      void main() {
        vec3 surface = texture2D(uSurface, vMapUv).rgb;
        vec3 mask = texture2D(uMask, vMapUv).rgb;
        float luminance = dot(surface, vec3(.2126, .7152, .0722));
        float terrain = pow(clamp(luminance, 0.0, 1.0), .65);
        vec3 land = mix(uLand, uHighland, terrain * .8);
        land *= .87 + .26 * terrain;
        vec3 sea = mix(uOcean, uShelf, smoothstep(.01, .20, surface.b) * .55);
        vec3 tinted = mix(sea, land, mask.r);
        // The reference globe stays photographic, so the day texture is blended back in:
        // strongly over the sea, lightly over land where the cobalt plates sit on top.
        vec3 colour = mix(tinted, surface, mix(.55, .22, mask.r));
        colour *= 1.0 + mask.r * .06;
        float facing = abs(dot(normalize(vWorldNormal), normalize(cameraPosition - vWorldPosition)));
        colour *= mix(.72, 1.0, smoothstep(0.0, .85, facing));
        gl_FragColor = vec4(colour, 1.0);
        #include <colorspace_fragment>
      }
    `,
    toneMapped: false,
  });
  const atmosphere = new Mesh(new SphereGeometry(101.2, 128, 64), new ShaderMaterial({
    uniforms: { uRim: { value: new Color(theme.focus) } },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        vNormal = normalize(mat3(modelMatrix) * normal);
        vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uRim;
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        float facing = abs(dot(normalize(vNormal), normalize(cameraPosition - vPosition)));
        float rim = pow(1.0 - facing, 3.2) * smoothstep(0.0, .16, facing);
        gl_FragColor = vec4(uRim, rim * .30);
        #include <colorspace_fragment>
      }
    `,
    side: BackSide, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  atmosphere.raycast = () => {};
  const configureTextures = (maxAnisotropy: number) => {
    for (const texture of [day, mask]) texture.anisotropy = Math.min(maxAnisotropy, 4);
  };
  return { earth, atmosphere, lights: [new AmbientLight(0xffffff, 1.8)], configureTextures };
}
