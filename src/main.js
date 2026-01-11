// @ts-nocheck , typescript has support but programming in js mainly.

// imports , shaders, locals, externals
import code from './shaders/fundamentals.wgsl?raw'; // this works fine with vite... (+?raw)

import { initWebGPU } from './utils/initWebGPU';
import { generateObserverCallback } from './utils/initWebGPU';
import { rand } from './utils/randomNumber';
import { createCircleVertices , createColoredCircleVertices} from './circle';

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
            buffers: [
                {
                    arrayStride: 5 * 4, // vertex positions
                    attributes: [
                        {shaderLocation: 0, offset: 0, format: 'float32x2'},
                        {shaderLocation: 4, offset: 8, format: 'float32x3'}
                    ]
                },
                {
                    arrayStride: 6 * 4, // color (4) + offset (2)
                    stepMode: 'instance', // every draw call increment by stride so the entire triangle
                    attributes: [         // vertice set has these values, instead of per vertex data
                        {shaderLocation: 1, offset: 0, format: 'float32x4'},
                        {shaderLocation: 2, offset: 16, format: 'float32x2'}
                    ]
                },
                {
                    arrayStride: 2 * 4, // scale positions
                    stepMode: 'instance',
                    attributes: [
                        {shaderLocation: 3, offset: 0, format: 'float32x2'},
                    ]
                },
            ]
        },
        fragment: {
            module,
            targets: [{ format: presentationFormat}],
        },
    });

    const kNumObjects = 5;
    const objectInfos = [];

    const kColorOffset = 0;
    const kOffsetOffset = 4;

    const kScaleOffset = 0;

    const staticUnitSize = 
    4 * 4 +
    2 * 4; // 4 values of 4 bytes + 2 values of 4 bytes

    const dynamicUnitSize = 
    2 * 4;

    const staticVertexBufferSize = staticUnitSize * kNumObjects;
    const dynamicVertexBufferSize = dynamicUnitSize * kNumObjects;

    // Vertex Data
    const { vertexData, numVertices } = createColoredCircleVertices({
    radius: 0.5,
    innerRadius: 0.25,
    });

    const vertexBuffer = device.createBuffer({
    label: 'vertices',
    size: vertexData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(vertexBuffer, 0, vertexData);


    // Color / Offset Data
    const staticVertexValues = new Float32Array(staticVertexBufferSize / 4);

    const staticVertexBuffer = device.createBuffer({
        label:'static',
        size: staticVertexBufferSize, // will be 4 values of 4 bytes + 2 values of 4 bytes + 2 values of padding of 4 bytes * number of objects
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    for (let i = 0; i < kNumObjects; ++i) {
        const staticOffset = i * (staticUnitSize / 4); // 0, 8 , 16 , 24
                                                       // 1cr,1cg,1cb,1ca,1px,1py,1pp,1pp,...
        staticVertexValues.set([rand(), rand(), rand(), 1], staticOffset + kColorOffset);        // set the color
        staticVertexValues.set([rand(-0.9, 0.9), rand(-0.9, 0.9)], staticOffset + kOffsetOffset);      // set the offset
 
        objectInfos.push({
            scale: rand(0.2, 0.5),
        });
    }
    device.queue.writeBuffer(staticVertexBuffer, 0, staticVertexValues);

    // Scale Data
    const vertexScaleValues = new Float32Array(dynamicVertexBufferSize / 4);

    const dynamicVertexBuffer = device.createBuffer({
        label:'dynamic',
        size: dynamicVertexBufferSize,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

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
            vertexScaleValues.set([scale / aspect, scale], offset + kScaleOffset);
        });

        device.queue.writeBuffer(dynamicVertexBuffer, 0, vertexScaleValues);
        
        pass.setVertexBuffer(0, vertexBuffer);
        pass.setVertexBuffer(1, staticVertexBuffer);
        pass.setVertexBuffer(2, dynamicVertexBuffer);

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