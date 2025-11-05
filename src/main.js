// @ts-nocheck 

import { initGPU } from './core/gpuDevice.js';
import { rand } from './utils/rand.js';

async function main()
{

    const canvas = document.querySelector('canvas');

    const {device, context, format} = await (initGPU(canvas))

    let shaderCode = await(await fetch('src/shaders/gpu_fundamentals.wgsl')).text();
    
    const module = (await device).createShaderModule({
        label: 'basic shader module',
        code: shaderCode,
    });

    const pipeline = device.createRenderPipeline({
        label: 'pipeline',
        layout: 'auto',
        vertex: {
            entryPoint: 'vs',
            module,
        },
        fragment : {
            entryPoint: 'fs',
            module,
            targets: [{ format: format}],
        }
    });

    const renderPassDescriptor = {
        label: 'renderpass',
        colorAttachments: [
            {
                view: undefined,
                clearValue: [0.3, 0.3, 0.3, 1.0],
                loadOp: 'clear',
                storeOp: 'store',
            },
        ],
    };

    const kColorOffset = 0;
    const kOffsetOffset = 4; // after 4 color values and 2 position values

    const kScaleOffset = 0; // after 4 (0 when split) colour values

    const kNumObjects = 100;
    const objectInfos = [];
    
    // create 2 storage buffers
    const staticUnitSize =
        4 * 4 + // color is 4 32bit floats (4bytes each)
        2 * 4 + // offset is 2 32bit floats (4bytes each)
        2 * 4;  // padding
    const changingUnitSize =
        2 * 4;  // scale is 2 32bit floats (4bytes each)
    const staticStorageBufferSize = staticUnitSize * kNumObjects;
    const changingStorageBufferSize = changingUnitSize * kNumObjects;
    
    const staticStorageBuffer = device.createBuffer({
        label: 'static storage for objects',
        size: staticStorageBufferSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    
    const changingStorageBuffer = device.createBuffer({
        label: 'changing storage for objects',
        size: changingStorageBufferSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    
    {
        const staticStorageValues = new Float32Array(staticStorageBufferSize / 4);
        for (let i = 0; i < kNumObjects; ++i) {
        const staticOffset = i * (staticUnitSize / 4);
    
        // These are only set once so set them now
        staticStorageValues.set([rand(), rand(), rand(), 1], staticOffset + kColorOffset);        // set the color
        staticStorageValues.set([rand(-0.9, 0.9), rand(-0.9, 0.9)], staticOffset + kOffsetOffset);      // set the offset
    
        objectInfos.push({
            scale: rand(0.2, 0.5),
        });
        }
        device.queue.writeBuffer(staticStorageBuffer, 0, staticStorageValues);
    }
    
    // a typed array we can use to update the changingStorageBuffer
    const storageValues = new Float32Array(changingStorageBufferSize / 4);
    
    const bindGroup = device.createBindGroup({
        label: 'bind group for objects',
        layout: pipeline.getBindGroupLayout(0),
        entries: [
        { binding: 0, resource: { buffer: staticStorageBuffer }},
        { binding: 1, resource: { buffer: changingStorageBuffer }},
        ],
    });

    function render() {

        renderPassDescriptor.colorAttachments[0].view =
            context.getCurrentTexture().createView();

        const encoder = device.createCommandEncoder({ label: 'encoder'});

        const pass = encoder.beginRenderPass(renderPassDescriptor);
        pass.setPipeline(pipeline);
        
        const aspect = canvas.width / canvas.height ;

        // set the scales for each object
        objectInfos.forEach(({scale}, ndx) => {
        const offset = ndx * (changingUnitSize / 4);
        storageValues.set([scale / aspect, scale], offset + kScaleOffset); // set the scale
        });
        // upload all scales at once
        device.queue.writeBuffer(changingStorageBuffer, 0, storageValues);
    
        pass.setBindGroup(0, bindGroup);
        pass.draw(3, kNumObjects);  // call our vertex shader 3 times for each instance

        pass.end();

        const commandBuffer = encoder.finish();
        device.queue.submit([commandBuffer]);
    }

    const observer = new ResizeObserver(entries => {
        for (const entry of entries) {
            const canvas = entry.target;
            const width = entry.contentBoxSize[0].inlineSize;
            const height = entry.contentBoxSize[0].blockSize;
            canvas.width = Math.max(1, Math.min(width, device.limits.maxTextureDimension2D));
            canvas.height = Math.max(1, Math.min(height, device.limits.maxTextureDimension2D));
        }

        render();
    })

    observer.observe(canvas)

}; 

async function otherMain(){
    
    const adapter = await navigator.gpu?.requestAdapter();
    const device = await adapter.requestDevice();

    let shaderCode = await(await fetch('src/shaders/compute.wgsl')).text();

    const module = device.createShaderModule({
        label: 'doubling',
        code: shaderCode
    });

    const pipeline = device.createComputePipeline({
        label: 'doubling',
        layout: 'auto',
        compute: {
            module,
        },
    });

    const input = new Float32Array([1, 3, 5]);

    const workBuffer = device.createBuffer({
        label: 'work buffer',
        size: input.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
    

    const resultBuffer = device.createBuffer({
        label: 'result buffer',
        size: input.byteLength,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    });

    device.queue.writeBuffer(workBuffer, 0, input);

    const bindGroup = device.createBindGroup({
        label: 'bindGroup for work buffer',
        layout: pipeline.getBindGroupLayout(0),
        entries: [
        { binding: 0, resource: { buffer: workBuffer } },
        ],
    })

    const encoder = device.createCommandEncoder({label: 'encoder'});
    const pass = encoder.beginComputePass({label: 'compute pass'})

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup)
    pass.dispatchWorkgroups(input.length);
    pass.end();

    encoder.copyBufferToBuffer(workBuffer, 0, resultBuffer, 0, resultBuffer.size);

    const commandBuffer = encoder.finish();
    device.queue.submit([commandBuffer]);

    await resultBuffer.mapAsync(GPUMapMode.READ);
    const result = new Float32Array(resultBuffer.getMappedRange());

    console.log('input', input);
    console.log('result', result);

    resultBuffer.unmap();

}

//document.getElementById('debug').innerHTML = ""

main()
otherMain()
