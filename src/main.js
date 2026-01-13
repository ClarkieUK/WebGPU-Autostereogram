// @ts-nocheck , typescript has support but programming in js mainly.

// imports , shaders, locals, externals
import code from './shaders/drawing_canvas.wgsl?raw'; // this works fine with vite... (+?raw)
import compute_code from './shaders/generate_storage_texture.wgsl?raw';

import { initWebGPU } from './utils/initWebGPU';
import { generateObserverCallback } from './utils/initWebGPU';
import { rand } from './utils/randomNumber';
import { createCircleVertices , createColoredCircleVertices} from './circle';



async function main()
{

    const {device, canvas, context, format: presentationFormat} = await initWebGPU();

    const ratio = canvas.width/canvas.height;

    let t = 2560;
    const texSize = [t, t/ratio];

    // w/h = tw / th

    // texture surface
    const vertexData = new Float32Array(6 * 2 * 2); // 6 vertices, 2 positions and 2 tex coords for each 
    
    vertexData.set([
    // pos       tex
    -1, -1,     0, 0,
     1, -1,     1, 0,
     1,  1,     1, 1,

    -1, -1,     0, 0,
    -1,  1,     0, 1,
     1,  1,     1, 1,
    ])

    const vertexBuffer = device.createBuffer({
    label: 'vertices',
    size: vertexData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(vertexBuffer, 0, vertexData);

    const storageTex = device.createTexture({
    size: texSize,
    format: "rgba8unorm",
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });

    // shaders
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

    const renderBindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
        { binding: 0, resource: storageTex.createView() },
    ],
    });

    const compute_module = device.createShaderModule({
        code: compute_code,
    });
    
    const compute_pipeline = device.createComputePipeline({
        label: 'circles in storage texture',
        layout: 'auto',
        compute: {
        module: compute_module,
        },
    });

    const computebindGroup = device.createBindGroup({
        layout: compute_pipeline.getBindGroupLayout(0),
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

        const compute_pass = encoder.beginComputePass();

        compute_pass.setPipeline(compute_pipeline);

        compute_pass.setBindGroup(0, computebindGroup);
        
        compute_pass.dispatchWorkgroups(texSize[0], texSize[1]);

        compute_pass.end();

        const pass = encoder.beginRenderPass(renderPassDescriptor);

        pass.setPipeline(pipeline);

        pass.setBindGroup(0, renderBindGroup);

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