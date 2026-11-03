import assert from 'node:assert/strict';
import {swipeDirection} from '../src/swipe-physics.ts';
for(const [x,y,w,v,expected]of [[96,0,400,0,0],[100,0,400,0,1],[-100,0,400,0,-1],[31,0,400,1500,0],[40,0,400,899,0],[40,0,400,900,1],[-40,0,400,-1200,-1],[110,120,400,1500,0],[110,0,400,-1500,0],[100,0,0,1500,0]])assert.equal(swipeDirection(x,y,w,v),expected,JSON.stringify({x,y,w,v}));
console.log('10 distance, velocity, direction and cancellation cases passed.');
