import source from 'world-atlas/countries-50m.json';
import { geoDistance, geoInterpolate } from 'd3-geo';
import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineSegments } from 'three';
import { atlasCountries, atlasOutlines, mergeTerritories } from './atlas';
import { theme } from './theme';

export function createMapDetail(radius:number) {
  const topology=mergeTerritories(source);
  const positions:number[]=[];
  const toPoint=([lng,lat]:number[])=>{
    const latitude=lat*Math.PI/180,longitude=lng*Math.PI/180;
    return [radius*Math.cos(latitude)*Math.sin(longitude),radius*Math.sin(latitude),radius*Math.cos(latitude)*Math.cos(longitude)];
  };
  for(const line of atlasOutlines(topology).coordinates){
    if(line.length<2)continue;
    let last=toPoint(line[0]);
    for(let i=1;i<line.length;i++){
      // Follow the sphere across long segments and the antimeridian.
      const start=line[i-1] as [number,number],end=line[i] as [number,number];
      const steps=Math.ceil(geoDistance(start,end)/(4*Math.PI/180));
      if(steps<=1){
        const next=toPoint(end);
        positions.push(...last,...next);
        last=next;
        continue;
      }
      const segment=geoInterpolate(start,end);
      for(let j=1;j<=steps;j++){
        const next=toPoint(segment(j/steps));
        positions.push(...last,...next);
        last=next;
      }
    }
  }
  const geometry=new BufferGeometry().setAttribute('position',new Float32BufferAttribute(positions,3));
  const outlines=new LineSegments(geometry,new LineBasicMaterial({color:theme.ink,opacity:.58,transparent:true,depthWrite:false}));
  outlines.renderOrder=1;
  return {outlines,countries:atlasCountries(topology)};
}
