// @ts-nocheck , typescript has support but programming in js mainly.

// imports , shaders, locals, externals
import code from './shaders/fundamentals.wgsl?raw'; // this works fine with vite... (+?raw)

import { initWebGPU } from './utils/initWebGPU';
import { generateObserverCallback } from './utils/initWebGPU';
import { rand } from './utils/randomNumber';
import { createCircleVertices } from './circle';

async function main()
{

    const {device, canvas, context, format: presentationFormat} = await initWebGPU();

    const module = device.createShaderModule({
        code: code,
    });

    const pipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
            module,
        },
        fragment: {
            module,
            targets: [{ format: presentationFormat}],
        },
    });

    const kNumObjects = 5;
    const objectInfos = [];

    const staticUnitSize = 
    4 * 4 +
    2 * 4 + 
    2 * 4; // per primative

    const dynamicUnitSize = 
    2 * 4 +
    2 * 4 ;

    const staticStorageBufferSize = staticUnitSize * kNumObjects;
    const dynamicStorageBufferSize = dynamicUnitSize * kNumObjects;
    
    const kColorOffset = 0;  // color first
    const kOffsetOffset = 4; // after 4 values

    const kScaleOffset = 0; 

    const { vertexData, numVertices } = createCircleVertices({
    radius: 0.5,
    innerRadius: 0.25,
    });

    const vertexStorageBuffer = device.createBuffer({
    label: 'storage buffer vertices',
    size: vertexData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(vertexStorageBuffer, 0, vertexData);

    const staticStorageBuffer = device.createBuffer({
        label:'static',
        size: staticStorageBufferSize, // will be 4 values of 4 bytes + 2 values of 4 bytes + 2 values of padding of 4 bytes * number of objects
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    const dynamicStorageBuffer = device.createBuffer({
        label:'dynamic',
        size: dynamicStorageBufferSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    const staticStorageValues = new Float32Array(staticStorageBufferSize / 4);

    for (let i = 0; i < kNumObjects; ++i) {
        const staticOffset = i * (staticUnitSize / 4); // 0, 8 , 16 , 24
                                                       // 1cr,1cg,1cb,1ca,1px,1py,1pp,1pp,...
        staticStorageValues.set([rand(), rand(), rand(), 1], staticOffset + kColorOffset);        // set the color
        staticStorageValues.set([rand(-0.9, 0.9), rand(-0.9, 0.9)], staticOffset + kOffsetOffset);      // set the offset
 
        objectInfos.push({
            scale: rand(0.2, 0.5),
        });
    }
    device.queue.writeBuffer(staticStorageBuffer, 0, staticStorageValues);

    const storageValues = new Float32Array(dynamicStorageBufferSize / 4);

    const bindGroup = device.createBindGroup({
        label: 'b1',
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: staticStorageBuffer }},
            { binding: 1, resource: { buffer: dynamicStorageBuffer }},
            { binding: 2, resource: { buffer: vertexStorageBuffer }},
        ]
    })

    const renderPassDescriptor = {
        colorAttachments: [
            {
                view: null,
                clearValue: [0.3, 0.3, 0.3, 1],
                loadOp:'clear',
                storeOp: 'store',
            },
        ],
    };

    function render() {

        renderPassDescriptor.colorAttachments[0].view =
            context.getCurrentTexture().createView();

        const encoder = device.createCommandEncoder({});

        const pass = encoder.beginRenderPass(renderPassDescriptor);

        pass.setPipeline(pipeline);

        const aspect = canvas.width / canvas.height;

        objectInfos.forEach(({scale}, ndx) => {
            const offset = ndx * (dynamicUnitSize / 4);
            storageValues.set([scale / aspect, scale], offset + kScaleOffset);
        });

        device.queue.writeBuffer(dynamicStorageBuffer, 0, storageValues);
        
        pass.setBindGroup(0, bindGroup);
        pass.draw(numVertices, kNumObjects);

        pass.end();

        const commandBuffer = encoder.finish();
        device.queue.submit([commandBuffer]);

    };

    const observer = new ResizeObserver(
        generateObserverCallback({ canvas: canvas, device: device, render})
    );
    observer.observe(canvas);

    console.log('Working...')
}

main()