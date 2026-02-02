// @ts-nocheck , typescript has support but programming in js mainly.

// imports , shaders, locals, externals
import code from './shaders/drawingCanvas.wgsl?raw'; // this works fine with vite... (+?raw)
import compute_code from './shaders/generateEpipolars.wgsl?raw';
import sphere_code from './shaders/sphereShader.wgsl?raw';

import { initWebGPU } from './utils/initWebGPU';
import { generateObserverCallback } from './utils/initWebGPU';
import { GPUProfiler } from './utils/gpuProfiler';
import { rand } from './utils/randomNumber';
import { Camera } from './camera.js';
import { Sphere } from './sphere.js';
import { SphereRenderer } from './sphereRenderer';
import { InputHandler } from './inputHandler.js';
import { Billboard } from './billboardManager';
import { Profiler } from './utils/codeProfiler';

import GUI from 'https://muigui.org/dist/0.x/muigui.module.js';
import {
  vec3,
  mat4,
} from 'https://wgpu-matrix.org/dist/3.x/wgpu-matrix.module.js';

async function main()
{
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

    const MONITOR_WIDTH = 0.60 // m
    const MONITOR_HEIGHT = 0.35 
    const MONITOR_RESOLUTION = [1920,1080]
    const IPD = 0.065
    const VIEWING_DISTANCE = 0.55 
    const SCENE_GAP = 2; 
    const planeDistance = VIEWING_DISTANCE + SCENE_GAP * 1;
    let COUPLED_EYES = 1

    const recWidth =  MONITOR_WIDTH; 
    const recHeight = MONITOR_HEIGHT;
        
    const {device, canvas, context, format: presentationFormat} = await initWebGPU();

    const profiler = new GPUProfiler(device);

    const gui = new GUI();

    const sphereGeometry = new Sphere(20);

    const sphereRenderer = new SphereRenderer(device, presentationFormat, 20);

    const camera = new Camera(
        [0, 0, VIEWING_DISTANCE],  // position
        [0, 1, 0],                  // world up
        -90.0,                      // yaw
        0.0                         // pitch
    );

    const inputHandler = new InputHandler(canvas, camera);

    const billboard = new Billboard(device, presentationFormat, recWidth, recHeight);

    inputHandler.setKeyCallback('KeyP', () => {
    COUPLED_EYES = !COUPLED_EYES;
    });

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

    // Scene buffer (eyes + spheres)
    const numSpheres = 3;
    const sceneSize = 
        (4 * 4) +           // left_eye: vec4f
        (4 * 4) +           // right_eye: vec4f  
        (1 * 4) + (3 * 4) + // sphere_count: u32 + padding
        ((3+1) * 4 * numSpheres);  // spheres array (16 bytes each: vec3f + f32)

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

        let x = (Math.random() - 0.5) * 2;
        let y = (Math.random() - 0.5) * 2;
        let z = -Math.random() * SCENE_GAP;

        let r =  (Math.random() * 0.25);

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

    // initialize count to 0
    const zeroData = new Uint32Array(1);
    device.queue.writeBuffer(splatStorageBuffer, 0, zeroData);

    const splatReadBuffer = device.createBuffer({
        label: 'splat read buffer',
        size: 1 * 4,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const statsBuffer = device.createBuffer({
    label: 'stats',
    size: 3 * 4, // 3 × u32
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });

    const statsReadBuffer = device.createBuffer({
        label: 'stats read',
        size: 3 * 4,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
 
    const backgroundPlaneBuffer = device.createBuffer({
        label: 'background plane buffer',
        size: (2 * 4) * 4, // two descriptive vec4fs
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })

    const planeData = new Float32Array(8);

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
            { binding: 5, resource: { buffer: backgroundPlaneBuffer }}
        ]
    })

    sphereRenderer.createBindGroup(matrixUniformBuffer, sceneBuffer);
    billboard.createBindGroup(rectangleUniformBuffer, splatStorageBuffer, matrixUniformBuffer);

    let depthTexture;

    function updateDepthTexture() {
        if (depthTexture) depthTexture.destroy();
        depthTexture = device.createTexture({
            size: [canvas.width, canvas.height],
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
    }

    updateDepthTexture();

    const renderPassDescriptor = {
        colorAttachments: [
            {
                view: null,
                clearValue: [0.3, 0.3, 0.3, 1],
                loadOp:'clear',
                storeOp: 'store',
            },
        ],
        depthStencilAttachment: {
        view: null, 
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
        },
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

    function updateEyePositions(device, sceneBuffer, camera, IPD) {
        const cameraRight = camera.right; // Already normalized
        const halfIPD = IPD / 2;
        
        // Calculate eye positions
        const leftEye = vec3.sub(camera.position, vec3.mulScalar(cameraRight, halfIPD));
        const rightEye = vec3.add(camera.position, vec3.mulScalar(cameraRight, halfIPD));
        
        // Only write eye data (32 bytes total: 2 × vec4f)
        const eyeData = new Float32Array(8); // 2 vec4f = 8 floats
        
        // Left eye: vec4f (offset 0-15)
        eyeData[0] = leftEye[0];
        eyeData[1] = leftEye[1];
        eyeData[2] = leftEye[2];
        eyeData[3] = 0.0; // padding
        
        // Right eye: vec4f (offset 16-31)
        eyeData[4] = rightEye[0];
        eyeData[5] = rightEye[1];
        eyeData[6] = rightEye[2];
        eyeData[7] = 0.0; // padding
        
        // Write only the first 32 bytes (eye positions)
        device.queue.writeBuffer(sceneBuffer, 0, eyeData);
    }

    function createBillboardMatrix(camera, distance = 0.55) {

        const position = vec3.add(
            camera.position, 
            vec3.mulScalar(camera.front, distance)
        );
        
        //  rotation matrix
        const forward = vec3.negate(camera.front); // flip dir too
        const right = camera.right;
        const up = camera.up;
        
        // model matrix from basis vectors
        const modelMatrix = mat4.create(
            right[0],    right[1],    right[2],    0,
            up[0],       up[1],       up[2],       0,
            forward[0],  forward[1],  forward[2],  0,
            position[0], position[1], position[2], 1
        );
        
        return modelMatrix;
    }

    const t = mat4.translate(m, [0, 0, 0]);    // operate t first so its applied last
    const s = mat4.scale(t, [1, 1, 1]);  
    const r = mat4.rotateZ(s, 0);    // act on t with r, its applied first in the context of the vertex multiplication 
    const origin_model_matrix = r;

    async function render() {
        if (isRendering) return;
        isRendering = true; // just incase im doing things inbetween

        const deltaTime = inputHandler.update();

        renderPassDescriptor.colorAttachments[0].view =
            context.getCurrentTexture().createView();

        renderPassDescriptor.depthStencilAttachment.view = 
            depthTexture.createView();

        // send uniforms 

        const test = createBillboardMatrix(camera, VIEWING_DISTANCE);
        // m * T
        // t * s -> m * T * S
        // s * r -> m * T * S * R
        // gl_Position = projection * view * model * vec4(aPos.x,aPos.y,aPos.z, 1.0);

        const viewMatrix = camera.getViewMatrix();
        const aspectRatio = canvas.width / canvas.height;
        const projectionMatrix = camera.getProjectionMatrix(aspectRatio);


        device.queue.writeBuffer(matrixUniformBuffer, (2 * 16) * 4, viewMatrix);
        device.queue.writeBuffer(matrixUniformBuffer, (3 * 16) * 4, projectionMatrix);
        
        if (COUPLED_EYES) {
            //updateEyePositions(device, sceneBuffer, camera, IPD);
            device.queue.writeBuffer(matrixUniformBuffer, 0, test);
            device.queue.writeBuffer(matrixUniformBuffer, (1 * 16) * 4, mat4.inverse(test));
        };

        updateEyePositions(device, sceneBuffer, camera, IPD);

        // updates for background plane
        const planeOrigin = vec3.add(
            camera.position,
            vec3.mulScalar(camera.front, planeDistance)
        );

        const planeNormal = vec3.negate(camera.front);
        const planeData = new Float32Array(8);
        planeData[0] = planeNormal[0];
        planeData[1] = planeNormal[1];
        planeData[2] = planeNormal[2];
        planeData[3] = 0.0; // padding
        planeData[4] = planeOrigin[0];
        planeData[5] = planeOrigin[1];
        planeData[6] = planeOrigin[2];
        planeData[7] = 0.0; // padding

        device.queue.writeBuffer(backgroundPlaneBuffer, 0, planeData);

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
        
        billboard.render(pass)

        // sphere stuff
        sphereRenderer.render(pass, numSpheres);

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
                console.log('Performance Shit -----------------------|');
                console.log(`Frames: ${perfStats.frameCount}`);
                console.log(`Splats: ${perfStats.splatCount}`);
                console.log(`Total rays: ${totalRays}`);
                console.log(`Successful rays: ${successfulRays}`);
                console.log(`Chain iterations: ${chainIterations}`);
                console.log(`Avg Compute: ${perfStats.avgComputeMs.toFixed(3)} ms`);
                console.log(`Avg Render:  ${perfStats.avgRenderMs.toFixed(3)} ms`);
                console.log(`Avg Total (GPU):   ${perfStats.avgTotalMs.toFixed(3)} ms`);
                console.log(`Avg Total (CPU):         ${(1000 * deltaTime).toFixed(5)} ms`);
                console.log(`GPU FPS:         ${(1000 / perfStats.avgTotalMs).toFixed(1)}`);
                console.log(`CPU FPS:         ${(1/deltaTime).toFixed(1)}`);
                console.log(`Theoretical rays/s: ${(totalRays / (perfStats.avgComputeMs / 1000)).toExponential(2)}`);
                framesSinceLog = 0;
            }
        }

        isRendering = false;
        requestAnimationFrame(render);
    };

    gui.onChange(render);
    gui.add(settings, 'enableProfiling').name('profiling');
    gui.add(settings, 'logInterval', 1, 300).name('interval');

    const observer = new ResizeObserver(
        generateObserverCallback({ 
            canvas: canvas, 
            device: device, 
            render,
            onResize: updateDepthTexture  // Add this
        })
    );
    observer.observe(canvas);
    
}

main()