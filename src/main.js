// @ts-nocheck , typescript has support but programming in js mainly.

// imports , shaders, locals, externals
import code from './shaders/drawing_canvas.wgsl?raw'; // this works fine with vite... (+?raw)
import compute_code from './shaders/generate_storage_texture.wgsl?raw';

import { initWebGPU } from './utils/initWebGPU';
import { generateObserverCallback } from './utils/initWebGPU';
import { rand } from './utils/randomNumber';

async function main()
{

    const {device, canvas, context, format: presentationFormat} = await initWebGPU();

    const texSize = [2560, 1440];

    // w / h = tw / th

    // uniforms
    const uniformBuffer = device.createBuffer({
        label: 'vertices',
        size: 8,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const resolution = new Float32Array(2);

    device.queue.writeBuffer(uniformBuffer, 0, resolution);

    // texture surface
    const vertexData = new Float32Array(6 * 2 * 2); // 6 vertices, 2 positions and 2 tex coords for each 
    
    vertexData.set([
    // pos       tex
    -0.8, -0.8,     0.0, 0.0,
     0.8, -0.8,     1, 0,
     0.8,  0.8,     1, 1,

    -0.8, -0.8,     0, 0,
    -0.8,  0.8,     0, 1,
     0.8,  0.8,     1, 1,
    ]) // vertices given in clip space coordinate space

    vertexData.set([
    //    pos       uv
     0,   0,       0, 0, 
     800, 0,       1, 0,
     800, 800,     1, 1,

     0,   0,       0, 0,
     0,   800,     0, 1,
     800, 800,     1, 1,
    ]) // vertices given in pixel space, weird shape for transformation intuiton

    const canvasRectangleVertexBuffer = device.createBuffer({
    label: 'rectangle vertices',
    size: vertexData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(canvasRectangleVertexBuffer, 0, vertexData);

    const storageTex = device.createTexture({
    label: 'storage texture',
    size: texSize, // could move this into render loop so its updated with resized browser
    format: "rgba8unorm",
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });

    // shaders
    const module = device.createShaderModule({
        label: 'rectangle geometry shader',
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

    const renderBindGroup = device.createBindGroup({
    label: 'rectangle bind group',
    layout: pipeline.getBindGroupLayout(0),
    entries: [
        { binding: 0, resource: storageTex.createView() },
        { binding: 1, resource: { buffer: uniformBuffer }}
    ],
    });

    const computeModule = device.createShaderModule({
        code: compute_code,
    });
    
    const computePipeline = device.createComputePipeline({
        label: 'storage texture',
        layout: 'auto',
        compute: {
        module: computeModule,
        },
    });

    const computebindGroup = device.createBindGroup({
        layout: computePipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: storageTex.createView() },
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

        // send uniforms 
        resolution.set([canvas.width,canvas.height]);
        device.queue.writeBuffer(uniformBuffer, 0, resolution);

        // generating texture
        const computePass = encoder.beginComputePass();

        computePass.setPipeline(computePipeline);

        computePass.setBindGroup(0, computebindGroup);
        
        computePass.dispatchWorkgroups(texSize[0], texSize[1]);

        computePass.end();

        // display texture in world
        const pass = encoder.beginRenderPass(renderPassDescriptor);

        pass.setPipeline(pipeline);

        pass.setBindGroup(0, renderBindGroup);

        pass.setVertexBuffer(0, canvasRectangleVertexBuffer);

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