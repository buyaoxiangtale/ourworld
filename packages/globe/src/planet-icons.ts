import {
  ACESFilmicToneMapping, CanvasTexture, DirectionalLight, Group, HemisphereLight,
  Mesh, MeshPhysicalMaterial, OrthographicCamera, RepeatWrapping, Scene, SphereGeometry,
  SRGBColorSpace, TextureLoader, TorusGeometry, Vector3, WebGLRenderer, type MeshPhysicalMaterialParameters,
} from 'three';

export type PlanetIcon = 'earth' | 'community' | 'chat' | 'profile';
export const planetRotationMs = 8000;
const porcelain = 0xd8d5cf;

function ceramic(parameters: MeshPhysicalMaterialParameters = {}) {
  return new MeshPhysicalMaterial({
    color: porcelain,
    roughness: .88,
    metalness: 0,
    specularIntensity: .15,
    ...parameters,
  });
}

function makeTexture(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { canvas, paint: canvas.getContext('2d')! };
}

function colourTexture(canvas: HTMLCanvasElement) {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

async function earthMaterial(textures: URL) {
  const loader = new TextureLoader();
  const [image, bump] = await Promise.all([
    loader.loadAsync(new URL('earth-day.jpg?v=4k', textures).href),
    loader.loadAsync(new URL('earth-topology.png', textures).href),
  ]);
  image.colorSpace = SRGBColorSpace;
  const material = ceramic({ map: image, bumpMap: bump, bumpScale: .06 });
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      #include <map_fragment>
      float land = smoothstep(0.018, 0.20, dot(sampledDiffuseColor.rgb, vec3(0.24, 0.62, 0.14)));
      diffuseColor.rgb = mix(vec3(0.31, 0.30, 0.28), vec3(0.90, 0.88, 0.84), land);
    `);
  };
  return material;
}

function communityMaterial() {
  const { canvas, paint } = makeTexture(512, 256);
  const pixels = paint.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const longitude = x / canvas.width * Math.PI * 2;
      const latitude = y / canvas.height * Math.PI;
      const band = latitude + Math.sin(3 * longitude + latitude * 2) * .022
        + Math.sin(6 * longitude - latitude) * .012;
      const storm = Math.sin(4 * longitude + 4 * latitude) * Math.sin(latitude) ** 5;
      const grey = 229 + 5 * Math.sin(17 * band) + 2 * Math.sin(36 * band) + 7 * storm;
      const i = (y * canvas.width + x) * 4;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = grey;
      pixels.data[i + 3] = 255;
    }
  }
  paint.putImageData(pixels, 0, 0);
  return ceramic({ map: colourTexture(canvas) });
}

function chatGeometry() {
  // Stretch a small area of the sphere into the tail so the light follows
  // a single surface from the main body to the point.
  const geometry = new SphereGeometry(.89, 64, 48);
  const points = geometry.attributes.position;
  const aim = new Vector3(-.52, -.84, .17).normalize();
  const point = new Vector3();
  for (let i = 0; i < points.count; i++) {
    point.fromBufferAttribute(points, i);
    const cap = Math.max(0, (point.dot(aim) / .89 - .81) / .19);
    const taper = cap ** 2.8;
    point.addScaledVector(aim, taper * .40);
    point.x -= taper * .055;
    points.setXYZ(i, point.x, point.y, point.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function engraveSmile(paint: CanvasRenderingContext2D, carve: CanvasRenderingContext2D) {
  const stroke = (context: CanvasRenderingContext2D, width: number, color: string | CanvasGradient, offset = 0) => {
    context.lineWidth = width;
    context.lineCap = 'round';
    context.strokeStyle = color;
    context.beginPath();
    context.moveTo(92, 127 + offset);
    context.quadraticCurveTo(128, 155 + offset, 164, 127 + offset);
    context.stroke();
  };

  // A porcelain-coloured lower lip and a shallow shadow suggest a cut in the clay.
  const shade = paint.createLinearGradient(92, 0, 164, 0);
  shade.addColorStop(0, '#a6a39d');
  shade.addColorStop(.25, '#86827c');
  shade.addColorStop(.75, '#86827c');
  shade.addColorStop(1, '#a6a39d');
  stroke(paint, 10, '#d2cec7', 1.3);
  stroke(paint, 7, shade);
  stroke(carve, 11, '#b3b3b3');
  stroke(carve, 7, '#909090');
}

function faceMaterial(kind: 'chat' | 'profile') {
  const { canvas, paint } = makeTexture(512, 256);
  const { canvas: relief, paint: carve } = makeTexture(512, 256);
  paint.fillStyle = '#fff';
  paint.fillRect(0, 0, canvas.width, canvas.height);
  carve.fillStyle = '#c6c6c6';
  carve.fillRect(0, 0, relief.width, relief.height);
  if (kind === 'profile') {
    engraveSmile(paint, carve);
  } else {
    for (const context of [paint, carve]) {
      context.fillStyle = context === paint ? '#555' : '#666';
      for (const x of [100, 128, 156]) {
        context.beginPath();
        context.arc(x, 123, 7, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  const map = colourTexture(canvas);
  const bumpMap = new CanvasTexture(relief);
  map.wrapS = bumpMap.wrapS = RepeatWrapping;
  const material = ceramic({ map, bumpMap, bumpScale: .042 });
  return { material, markings: [map, bumpMap] };
}

export async function createPlanetIcon(
  kind: PlanetIcon,
  readPixels = false,
  textures = new URL('textures/', document.baseURI),
) {
  const renderer = new WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: readPixels });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = .98;
  const scene = new Scene();
  const camera = new OrthographicCamera(-1.22, 1.22, 1.22, -1.22, .1, 20);
  camera.position.set(0, .18, 5);
  camera.lookAt(0, 0, 0);

  scene.add(new HemisphereLight(0xffffff, kind === 'profile' ? 0x9d9d9d : 0x535353, 1.35));
  const key = new DirectionalLight(0xffffff, 1.75);
  key.position.set(-3, 4, 4);
  const edge = new DirectionalLight(0xffffff, .45);
  edge.position.set(3, 1, -3);
  scene.add(key, edge);

  const tilt = new Group();
  const spin = new Group();
  tilt.add(spin);
  scene.add(tilt);
  let markings: CanvasTexture[] = [];

  switch (kind) {
    case 'earth':
      tilt.rotation.set(.12, 0, -.22);
      spin.add(new Mesh(new SphereGeometry(.96, 52, 36), await earthMaterial(textures)));
      break;
    case 'community': {
      tilt.rotation.set(.47, 0, -.35);
      spin.add(new Mesh(new SphereGeometry(.76, 48, 32), communityMaterial()));
      const ring = new Mesh(new TorusGeometry(.98, .072, 18, 96), ceramic());
      ring.rotation.x = Math.PI / 2;
      spin.add(ring);
      break;
    }
    case 'chat':
    case 'profile': {
      const chat = kind === 'chat';
      if (chat) tilt.position.y = .09;
      const face = faceMaterial(kind);
      markings = face.markings;
      spin.add(new Mesh(chat ? chatGeometry() : new SphereGeometry(.92, 56, 40), face.material));
      break;
    }
  }

  return {
    canvas: renderer.domElement,
    resize(size: number, ratio = 1) { renderer.setPixelRatio(ratio); renderer.setSize(size, size, false); },
    render(turn: number) {
      spin.rotation.y = turn * Math.PI * 2 + (kind === 'earth' ? -.7 : 0);
      // Compensate for the longitude shift while giving the engraving a small sway.
      for (const texture of markings) texture.offset.x = turn + Math.sin(turn * Math.PI * 2) * .026;
      renderer.render(scene, camera);
    },
    dispose() {
      scene.traverse(object => {
        if (object instanceof Mesh && object.material instanceof MeshPhysicalMaterial) {
          object.material.map?.dispose();
          object.material.bumpMap?.dispose();
          object.material.dispose();
          object.geometry.dispose();
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
