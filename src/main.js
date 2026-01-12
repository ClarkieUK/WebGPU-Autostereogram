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
    });

    // texture surface
    const vertexData = new Float32Array(6 * 2 * 2); // 6 vertices, 2 positions and 2 tex coords for each 
    
    vertexData.set([
    -1, -1,  0, 0,
    1, -1,  1, 0,
    1,  1,  1, 1,

    -1, -1,  0, 0,
    -1,  1,  0, 1,
    1,  1,  1, 1,
    ])

    const vertexBuffer = device.createBuffer({
    label: 'vertices',
    size: vertexData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(vertexBuffer, 0, vertexData);

    // texture data

    const kTextureWidth = 5;
    const kTextureHeight = 7;
    const _ = [255,   0,   0, 255];  // red
    const y = [255, 255,   0, 255];  // yellow
    const b = [  0,   0, 255, 255];  // blue
    const textureData = new Uint8Array([
        _, _, _, _, _,
        _, y, _, _, _,
        _, y, _, _, _,
        _, y, y, _, _,
        _, y, _, _, _,
        _, y, y, y, _,
        b, _, _, _, _,
        ].flat());

    const texture = device.createTexture({
        size: [kTextureWidth, kTextureHeight],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });

    device.queue.writeTexture(
        { texture },
        textureData,
        { bytesPerRow: kTextureWidth * 4 },
        { width: kTextureWidth, height: kTextureHeight },
    );

    // sampler

    const sampler = device.createSampler();

    const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: sampler},
            { binding: 1, resource: texture.createView() },
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

        pass.setBindGroup(0, bindGroup);

        pass.setVertexBuffer(0, vertexBuffer);

        pass.draw(6,1);

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