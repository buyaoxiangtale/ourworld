// 1:110m keeps country plates visually identical at globe scale while cutting polygon
// vertices by ~80%: faster ConicPolygonGeometry builds, fewer raycast triangles on drag
// and a ~600KB smaller bundle. Revisit only if per-country coastline detail is requested.
import source from 'world-atlas/countries-110m.json';
import { feature } from 'topojson-client';
import type { FeatureCollection, Geometry } from 'geojson';

interface AtlasGeometry {
  type: 'Polygon' | 'MultiPolygon';
  arcs: number[][] | number[][][];
  id?: string | number;
  properties?: { name?: string };
}

interface AtlasTopology {
  type: string;
  objects: { countries: { type: string; geometries: AtlasGeometry[] } } & Record<string, unknown>;
  arcs: unknown;
  transform?: unknown;
  bbox?: unknown;
}

const topology = source as unknown as AtlasTopology;

/**
 * Natural Earth ships Taiwan as a country of its own, which makes it a separate hit
 * target, a separate highlight and an unlisted country in every client. The product
 * requires it to render inside China, so the polygons are merged once here and every
 * consumer - feature(), geoContains(), the land mask and the selection style - inherits
 * the merged shape.
 *
 * Match by ISO id first and by name second so an atlas upgrade still resolves. Only add
 * entries whose arcs are disjoint from the target: a shared arc would be referenced
 * twice and topojson.mesh would redraw it as a coastline.
 */
const MERGES: { into: [string, string]; from: [string, string] }[] = [
  { into: ['156', 'China'], from: ['158', 'Taiwan'] },
];

const polygons = (geometry: AtlasGeometry): number[][][] =>
  geometry.type === 'Polygon' ? [geometry.arcs as number[][]] : (geometry.arcs as number[][][]);

const arcIds = (geometry: AtlasGeometry) =>
  polygons(geometry).flatMap(polygon => polygon.flatMap(ring => ring.map(Math.abs)));

const matches = (geometry: AtlasGeometry, [id, name]: [string, string]) =>
  String(geometry.id ?? '') === id || geometry.properties?.name === name;

const geometries = topology.objects.countries.geometries;
const removed = new Set<AtlasGeometry>();
const replacements = new Map<AtlasGeometry, AtlasGeometry>();

for (const { into, from } of MERGES) {
  const target = geometries.find(geometry => matches(geometry, into));
  const sourceGeometry = geometries.find(geometry => matches(geometry, from));
  if (!target || !sourceGeometry) {
    console.warn(`[globe] territory merge skipped: ${from.join(' / ')} -> ${into.join(' / ')}`);
    continue;
  }
  const targetArcs = new Set(arcIds(target));
  const shared = arcIds(sourceGeometry).filter(id => targetArcs.has(id));
  if (shared.length) console.warn(`[globe] territory merge shares arcs, border may double-draw: ${shared.join(',')}`);
  removed.add(sourceGeometry);
  replacements.set(target, {
    ...target,
    type: 'MultiPolygon',
    arcs: [...polygons(target), ...polygons(sourceGeometry)],
  });
}

const merged: AtlasTopology = {
  ...topology,
  objects: {
    ...topology.objects,
    countries: {
      ...topology.objects.countries,
      geometries: geometries.filter(geometry => !removed.has(geometry)).map(geometry => replacements.get(geometry) ?? geometry),
    },
  },
};

export const atlas = merged;

export const countries = feature(
  merged as never,
  merged.objects.countries as never,
) as unknown as FeatureCollection<Geometry>;
