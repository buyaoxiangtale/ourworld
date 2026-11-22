import {
  ACESFilmicToneMapping, CanvasTexture, DirectionalLight, Group, HemisphereLight,
  Mesh, MeshPhysicalMaterial, OrthographicCamera, PMREMGenerator, RepeatWrapping, Scene, SphereGeometry,
  SRGBColorSpace, TextureLoader, TorusGeometry, Vector3, WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export type PlanetIcon = 'earth' | 'community' | 'chat' | 'profile';
export const planetRotationMs = 8000;

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
    loader.loadAsync(new URL('earth-day.jpg', textures).href),
    loader.loadAsync(new URL('earth-topology.png', textures).href),
  ]);
  image.colorSpace = SRGBColorSpace;
  const material = new MeshPhysicalMaterial({
    map: image, bumpMap: bump, bumpScale: .035,
    roughness: .43, metalness: .24, clearcoat: .20, clearcoatRoughness: .34,
  });
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      #include <map_fragment>
      float silver = 0.072 + 1.02 * dot(diffuseColor.rgb, vec3(0.24, 0.62, 0.14));
      diffuseColor.rgb = vec3(silver);
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
      const grey = 143 + 12 * Math.sin(17 * band) + 5 * Math.sin(36 * band)
        + 2 * Math.sin(56 * band) + 12 * storm;
      const i = (y * canvas.width + x) * 4;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = grey;
      pixels.data[i + 3] = 255;
    }
  }
  paint.putImageData(pixels, 0, 0);
  return new MeshPhysicalMaterial({
    map: colourTexture(canvas), roughness: .33, metalness: .38,
    clearcoat: .45, clearcoatRoughness: .28,
  });
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

function faceMaterial(kind: 'chat' | 'profile') {
  const { canvas, paint } = makeTexture(512, 256);
  const { canvas: relief, paint: carve } = makeTexture(512, 256);
  paint.fillStyle = '#a9a9a9';
  paint.fillRect(0, 0, canvas.width, canvas.height);
  carve.fillStyle = '#c6c6c6';
  carve.fillRect(0, 0, relief.width, relief.height);
  for (const context of [paint, carve]) {
    context.fillStyle = context.strokeStyle = context === paint ? '#222' : '#555';
    if (kind === 'chat') {
      for (const x of [100, 128, 156]) {
        context.beginPath();
        context.arc(x, 123, 7, 0, Math.PI * 2);
        context.fill();
      }
      continue;
    }
    for (const x of [104, 152]) {
      context.beginPath();
      context.ellipse(x, 108, 7.5, 12, 0, 0, Math.PI * 2);
      context.fill();
    }
    context.lineWidth = 11;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(92, 139);
    context.quadraticCurveTo(128, 174, 164, 139);
    context.stroke();
  }

  // A subtle brushed finish turns with the sphere under the front-facing engraving.
  const { canvas: finish, paint: brush } = makeTexture(256, 32);
  for (let x = 0; x < finish.width; x++) {
    const angle = Math.PI * 2 * x / finish.width;
    const gray = Math.round(179 + 27 * Math.sin(angle * 3) + 10 * Math.sin(angle * 14));
    brush.fillStyle = `rgb(${gray},${gray},${gray})`;
    brush.fillRect(x, 0, 1, finish.height);
  }
  const map = colourTexture(canvas);
  const bumpMap = new CanvasTexture(relief);
  map.wrapS = bumpMap.wrapS = RepeatWrapping;
  const material = new MeshPhysicalMaterial({
    map, bumpMap, bumpScale: .032, roughnessMap: new CanvasTexture(finish),
    roughness: .49, metalness: .3, clearcoat: .30, clearcoatRoughness: .28,
  });
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

  const room = new RoomEnvironment();
  const pmrem = new PMREMGenerator(renderer);
  const environment = pmrem.fromScene(room);
  scene.environment = environment.texture;
  scene.environmentIntensity = .7;
  room.dispose();
  pmrem.dispose();
  scene.add(new HemisphereLight(0xffffff, 0x272727, .47));
  const key = new DirectionalLight(0xffffff, 2.35);
  key.position.set(-3, 4, 4);
  const edge = new DirectionalLight(0xffffff, 1.7);
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
      const ring = new Mesh(new TorusGeometry(.98, .072, 18, 96), new MeshPhysicalMaterial({
        color: 0xb6b6b6, roughness: .28, metalness: .58, clearcoat: .36,
      }));
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
      for (const texture of markings) texture.offset.x = turn + Math.sin(turn * Math.PI * 2) * .015;
      renderer.render(scene, camera);
    },
    dispose() {
      environment.dispose();
      scene.traverse(object => {
        if (object instanceof Mesh && object.material instanceof MeshPhysicalMaterial) {
          object.material.map?.dispose();
          object.material.bumpMap?.dispose();
          object.material.roughnessMap?.dispose();
          object.material.dispose();
          object.geometry.dispose();
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
