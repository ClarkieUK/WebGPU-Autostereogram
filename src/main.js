// @ts-nocheck , typescript has support but programming in js mainly.

// imports , shaders, locals, externals
import code from './shaders/drawingCanvas.wgsl?raw'; // this works fine with vite... (+?raw)
import compute_code from './shaders/generateEpipolars.wgsl?raw';

import { initWebGPU } from './utils/initWebGPU';
import { generateObserverCallback } from './utils/initWebGPU';
import { rand } from './utils/randomNumber';

import GUI from 'https://muigui.org/dist/0.x/muigui.module.js';

import {
  vec3,
  mat4,
} from 'https://wgpu-matrix.org/dist/3.x/wgpu-matrix.module.js';

async function main()
{

    const {device, canvas, context, format: presentationFormat} = await initWebGPU();

    const gui = new GUI();

    // w / h = tw / th

    const recWidth =  1.0;
    const recHeight = 1.0;

    // uniforms
    const rectangleUniformBuffer = device.createBuffer({
        label: 'uniforms',
        size: 6 * 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const rectangleUniformBufferValues = new Float32Array(6);
    const resolutionValue = rectangleUniformBufferValues.subarray(0, 2);
    const translationValue = rectangleUniformBufferValues.subarray(2, 4);
    const dimValue = rectangleUniformBufferValues.subarray(4, 6);

    // Set dim to world-space size of rectangle
    dimValue.set([1.0, 1.0]);

    device.queue.writeBuffer(rectangleUniformBuffer, 0, rectangleUniformBufferValues); 

    const matrixUniformBuffer = device.createBuffer({
        label: 'matrix uniforms',
        size: 2 * 16 * 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const m = mat4.identity();
    const t = mat4.translate(m, [0.0, 0, 0]);    // operate t first so its applied last
    const s = mat4.scale(t, [1, 1, 1]);  
    const r = mat4.rotateZ(s, Math.PI * 45.0/180);    // act on t with r, its applied first in the context of the vertex multiplication 
    const model_matrix = r;
    // m * T
    // t * s -> m * T * S
    // s * r -> m * T * S * R
    // gl_Position = projection * view * model * vec4(aPos.x,aPos.y,aPos.z, 1.0);
    device.queue.writeBuffer(matrixUniformBuffer, 0, model_matrix);
    device.queue.writeBuffer(matrixUniformBuffer, (4 * 4) * 4, mat4.inverse(model_matrix));
    
    // texture surface
    const vertexData = new Float32Array(6 * 2 * 2); // 6 vertices, 2 positions and 2 tex coords for each 

    vertexData.set([
    //          pos                  uv
     -recWidth/2, -recHeight/2,     0, 0, 
     recWidth/2,   recHeight/2,     1, 1,
     recWidth/2,  -recHeight/2,     1, 0,

     -recWidth/2, -recHeight/2,     0, 0, 
     recWidth/2,   recHeight/2,     1, 1,
     -recWidth/2,  recHeight/2,     0, 1,
    ]) // vertices given in pixel space

    const canvasRectangleVertexBuffer = device.createBuffer({
    label: 'rectangle vertices',
    size: vertexData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(canvasRectangleVertexBuffer, 0, vertexData);

    // Scene buffer (eyes + spheres)
    const numSpheres = 1;
    const sceneSize = 
        16 +        // left_eye: vec4f
        16 +        // right_eye: vec4f  
        4 + 12 +    // sphere_count: u32 + padding
        (16 * numSpheres); // spheres array (16 bytes each: vec3f + f32)

    const sceneData = new ArrayBuffer(sceneSize);
    const sceneView = new DataView(sceneData);

    let offset = 0;

    // left_eye: vec4f 
    sceneView.setFloat32(offset, -0.065 * 2.5, true); offset += 4; 
    sceneView.setFloat32(offset, 0.0, true); offset += 4;    
    sceneView.setFloat32(offset, 3.0, true); offset += 4;    
    sceneView.setFloat32(offset, 0.0, true); offset += 4;    

    // right_eye: vec4f
    sceneView.setFloat32(offset, 0.065 * 2.5, true); offset += 4;  
    sceneView.setFloat32(offset, 0.0, true); offset += 4;   
    sceneView.setFloat32(offset, 3.0, true); offset += 4;    
    sceneView.setFloat32(offset, 0.0, true); offset += 4;    

    // sphere_count: u32
    sceneView.setUint32(offset, numSpheres, true); offset += 4;
    offset += 12; // padding to align array

    // spheres: array<Sphere> 
    for (let i = 0; i < numSpheres; i++) {
        // centre: vec3f            0->1 : -0.5->0.5 : -1.0->1.0 

        let x = 1//(Math.random() - 0.5) * 2;
        let y = 1//(Math.random() - 0.5) * 2;
        let z = -2//-2.0 - Math.random() * 2;

        let r =  0.3;// + Math.random() * 0.1;

        console.log(x,y,z,r);

        sceneView.setFloat32(offset, x, true); offset += 4; // x
        sceneView.setFloat32(offset, y, true); offset += 4; // y
        sceneView.setFloat32(offset, z, true); offset += 4; // z 
        
        // radius: f32
        sceneView.setFloat32(offset, r, true); offset += 4; // radius 
    }

    const sceneBuffer = device.createBuffer({
        label: 'scene storage',
        size: sceneSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(sceneBuffer, 0, sceneData);

    // Splat buffer
    const maxSplats = 50000;
    const splatBufferSize = 4 + 12 + (maxSplats * 16); // atomic count + padding + points

    const splatStorageBuffer = device.createBuffer({
        label: 'splat storage',
        size: splatBufferSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // Initialize count to 0
    const zeroData = new Uint32Array(1);
    device.queue.writeBuffer(splatStorageBuffer, 0, zeroData);

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
        { binding: 0, resource: { buffer: rectangleUniformBuffer }},
        { binding: 1, resource: { buffer: splatStorageBuffer }},
        { binding: 2, resource: { buffer: matrixUniformBuffer }},
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
        label: 'compute',
        layout: computePipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: rectangleUniformBuffer }},
            { binding: 1, resource: { buffer: sceneBuffer }},
            { binding: 2, resource: { buffer: splatStorageBuffer }},
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
    scale: 1,
    rotation: 0,
    };

    function render() {

        renderPassDescriptor.colorAttachments[0].view =
            context.getCurrentTexture().createView();

        // send uniforms 
        resolutionValue.set([canvas.width, canvas.height]);
        translationValue.set(settings.translation);
        device.queue.writeBuffer(rectangleUniformBuffer, 0, rectangleUniformBufferValues);

        const t = mat4.translate(m, [settings.translation[0], settings.translation[1], 0]);    // operate t first so its applied last
        const s = mat4.scale(t, [settings.scale, settings.scale, 1]);  
        const r = mat4.rotateZ(s, Math.PI * settings.rotation/180);    // act on t with r, its applied first in the context of the vertex multiplication 
        const model_matrix = r;
        // m * T
        // t * s -> m * T * S
        // s * r -> m * T * S * R
        // gl_Position = projection * view * model * vec4(aPos.x,aPos.y,aPos.z, 1.0);
        device.queue.writeBuffer(matrixUniformBuffer, 0, model_matrix);
        device.queue.writeBuffer(matrixUniformBuffer, 64, mat4.inverse(model_matrix));


        const encoder = device.createCommandEncoder({});

        // Clear splat count
        encoder.clearBuffer(splatStorageBuffer, 0, 4);

        // generating texture
        const computePass = encoder.beginComputePass();
        computePass.setPipeline(computePipeline);
        computePass.setBindGroup(0, computebindGroup);
        computePass.dispatchWorkgroups(Math.ceil(500 / 64));
        computePass.end();

        // display texture in world
        const pass = encoder.beginRenderPass(renderPassDescriptor);
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, renderBindGroup);
        pass.setVertexBuffer(0, canvasRectangleVertexBuffer);
        pass.draw(6, 1);
        pass.end();

        const commandBuffer = encoder.finish();
        device.queue.submit([commandBuffer]);
    };

    gui.onChange(render);
    gui.add(settings.translation, '0', -1,1).name('translation.x');
    gui.add(settings.translation, '1', -1, 1).name('translation.y');
    gui.add(settings, 'scale', 0, 2).name('scale');
    gui.add(settings, 'rotation', 0, 360).name('rotation');
    
    const observer = new ResizeObserver(
        generateObserverCallback({ canvas: canvas, device: device, render})
    );
    observer.observe(canvas);

    console.log('Working...')
    
}

main()