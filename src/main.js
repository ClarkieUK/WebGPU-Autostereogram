// @ts-nocheck , typescript has support but programming in js mainly.

// imports , shaders, locals, externals
import code from './shaders/drawingCanvas.wgsl?raw'; // this works fine with vite... (+?raw)
import compute_code from './shaders/generateEpipolars.wgsl?raw';

import { initWebGPU } from './utils/initWebGPU';
import { generateObserverCallback } from './utils/initWebGPU';
import { rand } from './utils/randomNumber';

import GUI from 'https://muigui.org/dist/0.x/muigui.module.js';

async function main()
{

    const {device, canvas, context, format: presentationFormat} = await initWebGPU();

    const gui = new GUI();

    // w / h = tw / th

    const recWidth =  900.0;
    const recHeight = 900.0;

    // uniforms
    const rectangleUniformBuffer = device.createBuffer({
        label: 'vertices',
        size: 6 * 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const rectangleUniformBufferValues = new Float32Array(6);
    const resolutionValue = rectangleUniformBufferValues.subarray(0, 2);
    const translationValue = rectangleUniformBufferValues.subarray(2, 4);
    const dimValue = rectangleUniformBufferValues.subarray(4, 6);

    device.queue.writeBuffer(rectangleUniformBuffer, 0, rectangleUniformBufferValues); 
    // contains the origin-xy + width-height in world space
    // i.e +500 and dimValue[0] wide

    // texture surface
    const vertexData = new Float32Array(6 * 2 * 2); // 6 vertices, 2 positions and 2 tex coords for each 

    vertexData.set([
    //    pos                uv
     0,        0,           0, 0, 
     recWidth, 0,           1, 0,
     recWidth, recHeight,   1, 1,

     0,        0,           0, 0,
     0,        recHeight,   0, 1,
     recWidth, recHeight,   1, 1,
    ]) // vertices given in pixel space

    const canvasRectangleVertexBuffer = device.createBuffer({
    label: 'rectangle vertices',
    size: vertexData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(canvasRectangleVertexBuffer, 0, vertexData);

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
        { binding: 0, resource: { buffer: rectangleUniformBuffer }}
    ],
    });

    const staticStorageBuffer = device.createBuffer({
    label: 'static storage for objects',
    size: 64,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
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
        label: 'compute',
        layout: computePipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: {buffer: rectangleUniformBuffer }},
            { binding: 1, resource: {buffer: staticStorageBuffer }},
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

    const settings = {
    translation: [0, 0],
    };

    function render() {

        renderPassDescriptor.colorAttachments[0].view =
            context.getCurrentTexture().createView();

        const encoder = device.createCommandEncoder({});

        // send uniforms 
        resolutionValue.set([canvas.width,canvas.height]);
        translationValue.set(settings.translation);
        device.queue.writeBuffer(rectangleUniformBuffer, 0, rectangleUniformBufferValues);

        // generating texture
        const computePass = encoder.beginComputePass();

        computePass.setPipeline(computePipeline);

        computePass.setBindGroup(0, computebindGroup);
        
        computePass.dispatchWorkgroups(1);

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

    gui.onChange(render);
    gui.add(settings.translation, '0', 0, 1920).name('translation.x');
    gui.add(settings.translation, '1', 0, 1080).name('translation.y');

    const observer = new ResizeObserver(
        generateObserverCallback({ canvas: canvas, device: device, render})
    );
    observer.observe(canvas);

    console.log('Working...')
}

main()