//@ts-nocheck

import code from './shaders/drawingCanvas.wgsl?raw';

import {
  vec3,
  mat4,
} from 'https://wgpu-matrix.org/dist/3.x/wgpu-matrix.module.js';


export class Billboard {
    constructor(device, presentationFormat, recWidth, recHeight) {
        this.device = device

        this.recWidth = recWidth
        this.recHeight = recHeight
        
        this.createBuffers()
        this.createPipeline(presentationFormat)
    };

    createBuffers() {

        const vertexData = new Float32Array(6 * 2 * 2); // 6 vertices, 2 positions and 2 tex coords for each 

        vertexData.set([
        //          pos                  uv
        -this.recWidth/2, -this.recHeight/2,     0, 0, 
         this.recWidth/2,  this.recHeight/2,     1, 1,
         this.recWidth/2, -this.recHeight/2,     1, 0,

        -this.recWidth/2, -this.recHeight/2,     0, 0, 
         this.recWidth/2,  this.recHeight/2,     1, 1,
        -this.recWidth/2,  this.recHeight/2,     0, 1,
        ]) 

        this.vertexBuffer = this.device.createBuffer({
        label: 'rectangle vertices',
        size: vertexData.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });

        this.device.queue.writeBuffer(this.vertexBuffer, 0, vertexData);

    }

    createPipeline(presentationFormat) {
        const module = this.device.createShaderModule({
            label: 'sphere shader',
            code: code,
        });

        this.pipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module,
                buffers: [
                    {
                        arrayStride: 4 * 4, // 2 vertex positions -> 2 tex coord positions
                        attributes: [
                            { shaderLocation: 0, offset: 0, format: 'float32x2' },
                            { shaderLocation: 1, offset: 2 * 4, format: 'float32x2' }
                        ]
                    },
                ]
            },
            fragment: {
                module,
                targets: [{ format: presentationFormat}],
            },
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: 'less',
                format: 'depth24plus',
            },
        }); 
    }

    createBindGroup(rectangleUniformBuffer, splatStorageBuffer, matrixUniformBuffer) {
        this.bindGroup = this.device.createBindGroup({
        label: 'billboard bind group',
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: rectangleUniformBuffer }},
            { binding: 1, resource: { buffer: splatStorageBuffer }},
            { binding: 2, resource: { buffer: matrixUniformBuffer }},
            ],
        });
    }

    render(pass) {
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.bindGroup);
        pass.setVertexBuffer(0, this.vertexBuffer);
        pass.draw(6, 1);
    }   
}