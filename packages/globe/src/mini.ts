import { mountMiniature } from './mount-miniature';

let active = true;
let updateActive: ((value: boolean) => void) | undefined;
Object.assign(window, {
  setMiniatureActive(value: boolean) {
    active = value;
    updateActive?.(value);
  },
});

const fallback = document.querySelector<HTMLElement>('.planet-atlas')!;
void mountMiniature(document.body, fallback).then(update => {
  updateActive = update;
  update?.(active);
}).catch(() => { /* Keep the pre-rendered globe where WebGL is unavailable. */ });
