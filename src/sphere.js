//@ts-nocheck

import {
  vec3,
  mat4,
} from 'https://wgpu-matrix.org/dist/3.x/wgpu-matrix.module.js';

export class Sphere {
    constructor(resolution = 20) {
        this.resolution = resolution;
        this.vertices = [];
        this.normals = [];
        this.texCoords = [];
        this.indices = [];

        this.generateGeometry(1.0);
        this.interleaveVertices();
    }

    generateGeometry(radius) {
        const resolution = this.resolution;
        const deltaTheta = (2 * Math.PI) / resolution;
        const deltaPhi = Math.PI / resolution;

        for (let i = 0; i <= resolution; i++) {
            const phi = Math.PI / 2 - i * deltaPhi;
            const xy = radius * Math.cos(phi);
            const y = radius * Math.sin(phi);

            for (let j = 0; j <= resolution; j++) {
                const theta = j * deltaTheta;
                const x = xy * Math.cos(theta);
                const z = xy * Math.sin(theta);

                this.vertices.push(x, y, z);

                this.normals.push(x, y, z);

                const s = j / resolution;
                const t = i / resolution;
                this.texCoords.push(s, t);
            }
        }

        for (let i = 0; i < resolution; i++) {
            let k1 = i * (resolution + 1);
            let k2 = k1 + resolution + 1;

            for (let j = 0; j < resolution; j++) {
                if (i !== 0) {
                    this.indices.push(k1, k2, k1 + 1);
                }
                if (i !== resolution - 1) {
                    this.indices.push(k1 + 1, k2, k2 + 1);
                }
                k1++;
                k2++;
            }
        }
    }

    interleaveVertices() {
        this.interleavedVertices = [];
        for (let i = 0; i < this.vertices.length / 3; i++) {
            this.interleavedVertices.push(
                this.vertices[3 * i],       // x
                this.vertices[3 * i + 1],   // y
                this.vertices[3 * i + 2],   // z
                this.texCoords[2 * i],      // s
                this.texCoords[2 * i + 1],  // t
                this.normals[3 * i],        // nx
                this.normals[3 * i + 1],    // ny
                this.normals[3 * i + 2]     // nz
            );
        }
    }

    getVertexData() {
        return new Float32Array(this.interleavedVertices);
    }

    getIndexData() {
        return new Uint32Array(this.indices);
    }

    getIndexCount() {
        return this.indices.length;
    }

    static getVertexBufferLayout() {
        return {
            arrayStride: 8 * 4, // 8 floats * 4 bytes
            attributes: [
                {
                    shaderLocation: 0,
                    offset: 0,
                    format: 'float32x3' // position
                },
                {
                    shaderLocation: 1,
                    offset: 3 * 4,
                    format: 'float32x2' // texCoord
                },
                {
                    shaderLocation: 2,
                    offset: 5 * 4,
                    format: 'float32x3' // normal
                }
            ]
        };
    }
}