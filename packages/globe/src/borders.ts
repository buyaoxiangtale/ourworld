import { Group } from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { mesh } from 'topojson-client';
import { geoDistance, geoInterpolate } from 'd3-geo';
import atlas from 'world-atlas/countries-50m.json';
import type { Feature, Geometry, Position } from 'geojson';

type Project = (lat: number, lng: number, altitude: number) => { x: number; y: number; z: number };

/** Shared arcs are emitted once. Screen-space strokes stay readable on high-DPI phones. */
export function createCountryBorders(project: Project) {
  const group = new Group(); group.name = 'country-borders';
  const materials: LineMaterial[] = [];
  const positions = (lines: Position[][]) => {
    const result: number[] = [];
    for (const line of lines) for (let i = 1; i < line.length; i++) {
      const a = line[i - 1] as [number, number], b = line[i] as [number, number];
      const steps = Math.max(1, Math.ceil(geoDistance(a, b) / (Math.PI / 180)));
      const interpolate = geoInterpolate(a, b);
      for (let j = 0; j < steps; j++) for (const t of [j / steps, (j + 1) / steps]) {
        const [lng, lat] = interpolate(t), point = project(lat, lng, .0008);
        result.push(point.x, point.y, point.z);
      }
    }
    return result;
  };
  const stroke = (lines: Position[][], color: string, opacity: number, width: number) => {
    const geometry = new LineSegmentsGeometry(); geometry.setPositions(positions(lines));
    const material = new LineMaterial({color, opacity, transparent: true, linewidth: width, worldUnits: false, depthTest: true, depthWrite: false, toneMapped: false});
    materials.push(material);
    const line = new LineSegments2(geometry, material);
    line.raycast = () => {}; line.renderOrder = 2;
    group.add(line); return line;
  };
  const countries = atlas.objects.countries;
  const interior = mesh(atlas as never, countries as never, (a, b) => a !== b);
  const coast = mesh(atlas as never, countries as never, (a, b) => a === b);
  const normal = stroke(interior.coordinates, '#61707a', .78, .85);
  stroke(coast.coordinates, '#61707a', .30, .65);
  const selected = stroke([], '#c4cdd0', .95, 1.5);
  selected.visible = false;
  return {
    group,
    select(feature?: Feature<Geometry>) {
      const g = feature?.geometry;
      const lines = g?.type === 'Polygon' ? g.coordinates : g?.type === 'MultiPolygon' ? g.coordinates.flat() : [];
      selected.geometry.dispose();
      selected.geometry = new LineSegmentsGeometry().setPositions(positions(lines));
      selected.visible = lines.length > 0;
    },
    zoom(altitude: number) { (normal.material as LineMaterial).linewidth = altitude < 1.3 ? 1 : .85; },
    dispose() { group.children.forEach(line => (line as LineSegments2).geometry.dispose()); materials.forEach(material => material.dispose()); },
  };
}
