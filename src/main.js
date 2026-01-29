// @ts-nocheck , typescript has support but programming in js mainly.

// imports , shaders, locals, externals
import code from './shaders/drawingCanvas.wgsl?raw'; // this works fine with vite... (+?raw)
import compute_code from './shaders/generateEpipolars.wgsl?raw';

import { initWebGPU } from './utils/initWebGPU';
import { generateObserverCallback } from './utils/initWebGPU';
import { GPUProfiler } from './utils/gpuProfiler';
import { rand } from './utils/randomNumber';
import { Camera } from './camera.js';
import { InputHandler } from './inputHandler.js';

import GUI from 'https://muigui.org/dist/0.x/muigui.module.js';
import {
  vec3,
  mat4,
} from 'https://wgpu-matrix.org/dist/3.x/wgpu-matrix.module.js';

async function main()
{

    const {device, canvas, context, format: presentationFormat} = await initWebGPU();

    const profiler = new GPUProfiler(device);
    
    const perfStats = {
        frameCount: 0,
        computeTimeMs: 0,
        renderTimeMs: 0,
        totalTimeMs: 0,
        avgComputeMs: 0,
        avgRenderMs: 0,
        avgTotalMs: 0,
        splatCount: 0,
    };

    const gui = new GUI();

    const MONITOR_WIDTH = 0.60 // m
    const MONITOR_HEIGHT = 0.35 
    const MONITOR_RESOLUTION = [1920,1080]
    const IPD = 0.065
    const VIEWING_DISTANCE = 0.55 

    const recWidth =  MONITOR_WIDTH; 
    const recHeight = MONITOR_HEIGHT;

    const camera = new Camera(
        [0, 0, VIEWING_DISTANCE],  // position
        [0, 1, 0],                  // world up
        -90.0,                      // yaw
        0.0                         // pitch
    );

    const inputHandler = new InputHandler(canvas, camera);

    // w / h = tw / th

    // uniforms
    const rectangleUniformBuffer = device.createBuffer({
        label: 'uniforms',
        size: 4 * 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const rectangleUniformBufferValues = new Float32Array(4);
    const resolutionValue = rectangleUniformBufferValues.subarray(0, 2);
    const rectangleDimensions = rectangleUniformBufferValues.subarray(2, 4);

    resolutionValue.set(MONITOR_RESOLUTION);
    rectangleDimensions.set([MONITOR_WIDTH, MONITOR_HEIGHT]);

    device.queue.writeBuffer(rectangleUniformBuffer, 0, rectangleUniformBufferValues); 

    const matrixUniformBuffer = device.createBuffer({
        label: 'matrix uniforms',
        size: 4 * 16 * 4, // model, inverse model, view, proj
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const m = mat4.identity();
    
    // texture surface
    const vertexData = new Float32Array(6 * 2 * 2); // 6 vertices, 2 positions and 2 tex coords for each 

    vertexData.set([
    //          pos                  uv
     -recWidth/2, -recHeight/2,     0, 0, 
      recWidth/2,  recHeight/2,     1, 1,
      recWidth/2, -recHeight/2,     1, 0,

     -recWidth/2, -recHeight/2,     0, 0, 
      recWidth/2,  recHeight/2,     1, 1,
     -recWidth/2,  recHeight/2,     0, 1,
    ]) // vertices given in a model space

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
    sceneView.setFloat32(offset, -IPD/2, true); offset += 4; 
    sceneView.setFloat32(offset, 0.0, true); offset += 4;    
    sceneView.setFloat32(offset, VIEWING_DISTANCE, true); offset += 4;    
    sceneView.setFloat32(offset, 0.0, true); offset += 4;    

    // right_eye: vec4f
    sceneView.setFloat32(offset, IPD/2, true); offset += 4;  
    sceneView.setFloat32(offset, 0.0, true); offset += 4;   
    sceneView.setFloat32(offset, VIEWING_DISTANCE, true); offset += 4;    
    sceneView.setFloat32(offset, 0.0, true); offset += 4;    

    // sphere_count: u32
    sceneView.setUint32(offset, numSpheres, true); offset += 4;
    offset += 12; // padding to align array

    // spheres: array<Sphere> 
    for (let i = 0; i < numSpheres; i++) {
        // centre: vec3f            0->1 : -0.5->0.5 : -1.0->1.0 

        let x = 0//(Math.random() - 0.5) * 2;
        let y = 0//(Math.random() - 0.5) * 2;
        let z = -0.55//-2.0 - Math.random() * 2;

        let r =  0.2;// + Math.random() * 0.1;

        //console.log(x,y,z,r);

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
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });

    const splatReadBuffer = device.createBuffer({
        label: 'splat read buffer',
        size: 4,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const statsBuffer = device.createBuffer({
    label: 'stats',
    size: 12, // 3 × u32
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });

    const statsReadBuffer = device.createBuffer({
        label: 'stats read',
        size: 12,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    // initialize count to 0
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
            { binding: 1, resource: { buffer: matrixUniformBuffer }},
            { binding: 2, resource: { buffer: sceneBuffer }},
            { binding: 3, resource: { buffer: splatStorageBuffer }},
            { binding: 4, resource: { buffer: statsBuffer }},
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
    enableProfiling: true,
    logInterval: 60,
    };

    let framesSinceLog = 0;
    let isRendering = false;

    async function render() {
        if (isRendering) return;
        isRendering = true; // just incase im doing things inbetween

        const deltaTime = inputHandler.update();

        renderPassDescriptor.colorAttachments[0].view =
            context.getCurrentTexture().createView();

        // send uniforms 
        const t = mat4.translate(m, [settings.translation[0], settings.translation[1], 0]);    // operate t first so its applied last
        const s = mat4.scale(t, [settings.scale, settings.scale, 1]);  
        const r = mat4.rotateZ(s, Math.PI * settings.rotation/180);    // act on t with r, its applied first in the context of the vertex multiplication 
        const model_matrix = r;
        // m * T
        // t * s -> m * T * S
        // s * r -> m * T * S * R
        // gl_Position = projection * view * model * vec4(aPos.x,aPos.y,aPos.z, 1.0);

        const viewMatrix = camera.getViewMatrix();
        const aspectRatio = canvas.width / canvas.height;
        const projectionMatrix = camera.getProjectionMatrix(aspectRatio);

        device.queue.writeBuffer(matrixUniformBuffer, 0, model_matrix);
        device.queue.writeBuffer(matrixUniformBuffer, (1 * 16) * 4, mat4.inverse(model_matrix));
        device.queue.writeBuffer(matrixUniformBuffer, (2 * 16) * 4, viewMatrix);
        device.queue.writeBuffer(matrixUniformBuffer, (3 * 16) * 4, projectionMatrix);

        const encoder = device.createCommandEncoder({}); // this is kinda where you can think of the gpu loop as starting

        // Clear splat count
        encoder.clearBuffer(splatStorageBuffer, 0, 4); // clear atomics
        encoder.clearBuffer(statsBuffer, 0, 12);

        if (settings.enableProfiling) { encoder.writeTimestamp(profiler.querySet, 0); }

        // generating texture data
        const computePass = encoder.beginComputePass();
        computePass.setPipeline(computePipeline);
        computePass.setBindGroup(0, computebindGroup);
        computePass.dispatchWorkgroups(Math.ceil(1024 / 64));
        computePass.end();

        if (settings.enableProfiling) { encoder.writeTimestamp(profiler.querySet, 1); }

        encoder.copyBufferToBuffer(statsBuffer, 0, statsReadBuffer, 0, 12);

        if (settings.enableProfiling) { encoder.writeTimestamp(profiler.querySet, 2); }

        // display window rectangle in world
        const pass = encoder.beginRenderPass(renderPassDescriptor);
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, renderBindGroup);
        pass.setVertexBuffer(0, canvasRectangleVertexBuffer);
        pass.draw(6, 1);
        pass.end();

        if (settings.enableProfiling) { encoder.writeTimestamp(profiler.querySet, 3); }

        encoder.copyBufferToBuffer(splatStorageBuffer, 0, splatReadBuffer, 0, 4);
        encoder.copyBufferToBuffer(statsBuffer, 0, statsReadBuffer, 0, 12);

        if (settings.enableProfiling) {
            encoder.resolveQuerySet(profiler.querySet, 0, 4, profiler.resolveBuffer, 0);
            encoder.copyBufferToBuffer(
                profiler.resolveBuffer, 0,
                profiler.resultBuffer, 0,
                profiler.resultBuffer.size
            );
        }

        const commandBuffer = encoder.finish();
        device.queue.submit([commandBuffer]);

        if (settings.enableProfiling) {
            const timingResults = await profiler.getResults();
            
            if (timingResults.length >= 2) {
                const computeTime = timingResults[0].durationMs; // timestamps 0-1
                const renderTime = timingResults[1].durationMs;  // timestamps 2-3
                const totalTime = computeTime + renderTime;

                perfStats.frameCount++;
                perfStats.computeTimeMs += computeTime;
                perfStats.renderTimeMs += renderTime;
                perfStats.totalTimeMs += totalTime;

                perfStats.avgComputeMs = perfStats.computeTimeMs / perfStats.frameCount;
                perfStats.avgRenderMs = perfStats.renderTimeMs / perfStats.frameCount;
                perfStats.avgTotalMs = perfStats.totalTimeMs / perfStats.frameCount;
            }

            // read splat count
            await splatReadBuffer.mapAsync(GPUMapMode.READ);
            const splatCountData = new Uint32Array(splatReadBuffer.getMappedRange());
            perfStats.splatCount = splatCountData[0];
            splatReadBuffer.unmap();

            // read stats
            await statsReadBuffer.mapAsync(GPUMapMode.READ);
            const statsData = new Uint32Array(statsReadBuffer.getMappedRange());
            const totalRays = statsData[0];
            const successfulRays = statsData[1];
            const chainIterations = statsData[2];
            statsReadBuffer.unmap();

            framesSinceLog++;
            if (framesSinceLog >= settings.logInterval) {
                console.log('=== Performance Stats ===');
                console.log(`Frames: ${perfStats.frameCount}`);
                console.log(`Splats: ${perfStats.splatCount}`);
                console.log(`Total rays: ${totalRays}`);
                console.log(`Successful rays: ${successfulRays}`);
                console.log(`Chain iterations: ${chainIterations}`);
                console.log(`Avg Compute: ${perfStats.avgComputeMs.toFixed(3)} ms`);
                console.log(`Avg Render:  ${perfStats.avgRenderMs.toFixed(3)} ms`);
                console.log(`Avg Total:   ${perfStats.avgTotalMs.toFixed(3)} ms`);
                console.log(`FPS:         ${(1000 / perfStats.avgTotalMs).toFixed(1)}`);
                console.log(`Theoretical rays/s: ${(totalRays / (perfStats.avgComputeMs / 1000)).toExponential(2)}`);
                framesSinceLog = 0;
            }
        }

        isRendering = false;
        requestAnimationFrame(render);
    };

    gui.onChange(render);
    gui.add(settings.translation, '0', -1,1).name('translation.x');
    gui.add(settings.translation, '1', -1, 1).name('translation.y');
    gui.add(settings, 'scale', 0, 2).name('scale');
    gui.add(settings, 'rotation', 0, 360).name('rotation');
    gui.add(settings, 'enableProfiling').name('profiling');
    gui.add(settings, 'logInterval', 1, 300).name('interval');

    const observer = new ResizeObserver(
        generateObserverCallback({ canvas: canvas, device: device, render})
    );
    observer.observe(canvas);
    
}

main()