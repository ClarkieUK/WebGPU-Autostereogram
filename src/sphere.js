//@ts-nocheck

import {
  vec3,
  mat4,
} from 'https://wgpu-matrix.org/dist/3.x/wgpu-matrix.module.js';

// since we arent dealing with any computations on the gpu 
// all of the values stored are just in a way that makes them easy to shuffle 
// into the storage buffer for when we have them in vec3/4 form inside the buffers

// drawing with instancing so uniforms bindgroups etc are all gonna be global

export class Sphere {
    constructor(radius = 0.1, position, velocity, mass) {
        this.radius = radius
        this.position = vec3.create(...position)
        this.velocity = vec3.create(...velocity)
        // we arent storing acceleration, we are only dealing with 
        // dt * a ~ v 
    }
}

