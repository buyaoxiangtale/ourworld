import {
  AdditiveBlending, AmbientLight, BackSide, CanvasTexture, Color, Mesh,
  ShaderMaterial, SphereGeometry, SRGBColorSpace, TextureLoader,
} from 'three';
import { geoEquirectangular, geoPath } from 'd3-geo';
import type { Feature, FeatureCollection, Geometry } from 'geojson';

/** Cloud-free night-map palette: the surface uses no sun, clock or night-side imagery. */
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
      uOcean: { value: new Color('#091725') }, uShelf: { value: new Color('#102535') },
      uLand: { value: new Color('#26343c') }, uHighland: { value: new Color('#3a4a50') },
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
        vec3 color = mix(sea, land, mask.r);
        color *= 1.0 + mask.g * .10;
        float facing = abs(dot(normalize(vWorldNormal), normalize(cameraPosition - vWorldPosition)));
        color *= mix(.60, 1.0, smoothstep(0.0, .85, facing));
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
    toneMapped: false,
  });
  const atmosphere = new Mesh(new SphereGeometry(101.2, 128, 64), new ShaderMaterial({
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
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        float facing = abs(dot(normalize(vNormal), normalize(cameraPosition - vPosition)));
        float rim = pow(1.0 - facing, 4.0) * smoothstep(0.0, .18, facing);
        gl_FragColor = vec4(.08, .15, .22, rim * .12);
        #include <colorspace_fragment>
      }
    `,
    side: BackSide, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  atmosphere.raycast = () => {};
  const configureTextures = (maxAnisotropy: number) => {
    for (const texture of [day, mask]) texture.anisotropy = Math.min(maxAnisotropy, 4);
  };
  const selectCountry = (country?: Feature<Geometry>) => {
    context.fillStyle = '#000000'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.beginPath(); path(countries); context.fillStyle = '#ff0000'; context.fill();
    if (country) { context.beginPath(); path(country); context.fillStyle = '#ffff00'; context.fill(); }
    mask.needsUpdate = true;
  };
  return { earth, atmosphere, lights: [new AmbientLight(0xffffff, 1.8)], configureTextures, selectCountry };
}
