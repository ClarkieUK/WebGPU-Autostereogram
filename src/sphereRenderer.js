//@ts-nocheck

import { Sphere } from './sphere.js';
import sphere_code from './shaders/sphereShader.wgsl?raw';

import {
  vec3,
  mat4,
} from 'https://wgpu-matrix.org/dist/3.x/wgpu-matrix.module.js';


export class SphereRenderer {
    constructor(device, presentationFormat, resolution = 20) {
        this.device = device
        this.mesh = new Sphere(resolution)
        
        this.createBuffers()
        this.createPipeline(presentationFormat)
    };

    createBuffers() {
        this.vertexBuffer = this.device.createBuffer({
            label: 'sphere vertices',
            size: this.mesh.getVertexData().byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });

        this.device.queue.writeBuffer(this.vertexBuffer, 0, this.mesh.getVertexData())

        this.indexBuffer = this.device.createBuffer({
            label: 'sphere indices',
            size: this.mesh.getIndexData().byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });
        
        this.device.queue.writeBuffer(this.indexBuffer, 0, this.mesh.getIndexData());
    }

    createPipeline(presentationFormat) {
        const module = this.device.createShaderModule({
            label: 'sphere shader',
            code: sphere_code,
        });

        this.pipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module,
                buffers: [Sphere.getVertexBufferLayout()],
            },
            fragment: {
                module,
                targets: [{ format: presentationFormat }],
            },
            primitive: {
                topology: 'triangle-list',
                cullMode: 'none',
            },
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: 'less',
                format: 'depth24plus',
            },
        });
    }

    createBindGroup(matrixUniformBuffer, sceneBuffer) {
        this.bindGroup = this.device.createBindGroup({
            label: 'sphere bind group',
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: matrixUniformBuffer }},
                { binding: 1, resource: { buffer: sceneBuffer }},
            ],
        });
    }

    render(pass, numSpheres) {
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.bindGroup);
        pass.setVertexBuffer(0, this.vertexBuffer);
        pass.setIndexBuffer(this.indexBuffer, 'uint32');
        pass.drawIndexed(this.mesh.getIndexCount(), numSpheres, 0, 0, 0);
    }   
}