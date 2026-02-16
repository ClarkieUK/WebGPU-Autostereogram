// @ts-nocheck , typescript has support but programming in js mainly.

// imports , shaders, locals, externals
import code from './shaders/drawingCanvas.wgsl?raw'; // this works fine with vite... (+?raw)
import compute_code from './shaders/generateEpipolars.wgsl?raw';
import sphere_code from './shaders/sphereShader.wgsl?raw';
import nbody_code from './shaders/integrator.wgsl?raw';

import { initWebGPU } from './utils/initWebGPU.js';
import { generateObserverCallback } from './utils/initWebGPU.js';
import { GPUProfiler } from './utils/gpuProfiler.js';
import { Profiler } from './utils/codeProfiler.js';
import { rand } from './utils/randomNumber.js';
import { Camera } from './camera.js';
import { Sphere } from './sphere.js';
import { SphereRenderer } from './sphereRenderer.js';
import { InputHandler } from './inputHandler.js';
import { Billboard } from './billboardManager.js';

import GUI from 'https://muigui.org/dist/0.x/muigui.module.js';
import {
  vec3,
  vec4,
  mat4,
} from 'https://wgpu-matrix.org/dist/3.x/wgpu-matrix.module.js';

async function main()
{
    let COUPLED_EYES = 1
    let RENDER_SPHERES = 1 
    let SIMULATING = 0

    const MONITOR_WIDTH = 0.60 // m
    const MONITOR_HEIGHT = 0.35 
    const MONITOR_RESOLUTION = [1920,1080]
    const IPD = 0.065
    const VIEWING_DISTANCE = 0.55 
    const SCENE_GAP = 2; 

    const backgroundPlaneDistance = VIEWING_DISTANCE + SCENE_GAP * 0.8;
    const recWidth =  MONITOR_WIDTH; 
    const recHeight = MONITOR_HEIGHT;

    const {device, canvas, context, format: presentationFormat} = await initWebGPU();

    const settings = {
        enableProfiling: false,
        logInterval: 60,
        noise: 0,
        angle: 0,
        scaler: 1,
        seedCount: 64,
    };

    const profiler = new Profiler(device, 
        {enableProfiling: settings.enableProfiling,
        logInterval: settings.logInterval
    });

    const gui = new GUI();

    // world geometries
    const sphereGeometry = new Sphere(20);
    const sphereRenderer = new SphereRenderer(device, presentationFormat, 20);

    const billboard = new Billboard(device, presentationFormat, recWidth, recHeight);

    // camera orientated stuff
    const camera = new Camera(
        [0, 0, VIEWING_DISTANCE],   // position
        [0, 1, 0],                  // world up
        -90.0,                      // yaw
        0.0                         // pitch
    );

    const inputHandler = new InputHandler(canvas, camera);

    inputHandler.setKeyCallback('KeyP', () => {
    COUPLED_EYES = !COUPLED_EYES;
    });

    inputHandler.setKeyCallback('KeyO', () => {
    RENDER_SPHERES = !RENDER_SPHERES;
    });

    inputHandler.setKeyCallback('KeyI', () => {
    SIMULATING = !SIMULATING;
    });

    // uniforms
    const billboardUniformBuffer = device.createBuffer({
        label: 'uniforms',
        size: 4 * 4 + 1 * 4 + 1 * 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const billboardUniformBufferValues = new Float32Array(6);
    const resolutionValue = billboardUniformBufferValues.subarray(0, 2);
    const rectangleDimensions = billboardUniformBufferValues.subarray(2, 4);
    const noiseCount = billboardUniformBufferValues.subarray(4,5);
    const seedCount = billboardUniformBufferValues.subarray(5,6);

    resolutionValue.set(MONITOR_RESOLUTION);
    rectangleDimensions.set([MONITOR_WIDTH, MONITOR_HEIGHT]); 
    noiseCount.set([settings.noise]);
    seedCount.set([settings.seedCount]);

    device.queue.writeBuffer(billboardUniformBuffer, 0, billboardUniformBufferValues); 

    const matrixUniformBuffer = device.createBuffer({
        label: 'matrix uniforms',
        size: 4 * 16 * 4, // model, inverse model, view, proj
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const m = mat4.identity();

    // Scene buffer (eyes + spheres)
    const numSpheres = 5;
    const sceneSize = 
        (4 * 4) +           // left_eye: vec4f
        (4 * 4) +           // right_eye: vec4f  
        (4 * 4) +
        (4 * 4) +
        (1 * 4) + (3 * 4) + // sphere_count: u32 + padding
        ((3+1+3+1) * 4 * numSpheres);  // spheres array (32 bytes each: vec3f + f32 + vec3f + f32)

    const sceneData = new ArrayBuffer(sceneSize);
    const sceneView = new DataView(sceneData);

    let offset = 0;

    sceneView.setFloat32(offset, -IPD/2, true); offset += 4; 
    sceneView.setFloat32(offset, 0.0, true); offset += 4;    
    sceneView.setFloat32(offset, VIEWING_DISTANCE, true); offset += 4;    
    sceneView.setFloat32(offset, 0.0, true); offset += 4;    

    sceneView.setFloat32(offset, IPD/2, true); offset += 4;  
    sceneView.setFloat32(offset, 0.0, true); offset += 4;   
    sceneView.setFloat32(offset, VIEWING_DISTANCE, true); offset += 4;    
    sceneView.setFloat32(offset, 0.0, true); offset += 4;    

    sceneView.setFloat32(offset, 0, true); offset += 4;  
    sceneView.setFloat32(offset, IPD * Math.sqrt(3/4), true); offset += 4;   
    sceneView.setFloat32(offset, VIEWING_DISTANCE, true); offset += 4;    
    sceneView.setFloat32(offset, 0.0, true); offset += 4;    

    sceneView.setFloat32(offset, 0, true); offset += 4;  
    sceneView.setFloat32(offset, IPD * Math.sqrt(3/4), true); offset += 4;   
    sceneView.setFloat32(offset, VIEWING_DISTANCE, true); offset += 4;    
    sceneView.setFloat32(offset, 0.0, true); offset += 4;    

    // sphere_count: u32
    sceneView.setUint32(offset, numSpheres, true); offset += 4;
    offset += 12; // padding to align array
    const scale = 1;
    // spheres: array<Sphere> 
    for (let i = 0; i < numSpheres; i++) {
        // centre: vec3f            0->1 : -0.5->0.5 : -1.0->1.0 

        let x = (Math.random() - 0.5) * 2 * scale;
        let y = (Math.random() - 0.5) * 2 * scale;
        let z = -Math.random() * SCENE_GAP * scale;

        let r =  (Math.random() * 0.25);

        //console.log(x,y,z,r);

        // pyz: vec3f
        sceneView.setFloat32(offset, x, true); offset += 4; // x
        sceneView.setFloat32(offset, y, true); offset += 4; // y
        sceneView.setFloat32(offset, z, true); offset += 4; // z 
        
        // r: f32
        sceneView.setFloat32(offset, r, true); offset += 4; // radius 

        // vxvyvz: vec3f (Math.random()-0.5) * 0.1
        sceneView.setFloat32(offset, 0, true); offset += 4; // x
        sceneView.setFloat32(offset, 0, true); offset += 4; // y
        sceneView.setFloat32(offset, 0, true); offset += 4; // z 

        sceneView.setFloat32(offset, r, true); offset += 4;
    }

    const sceneBuffer = device.createBuffer({
        label: 'scene storage',
        size: sceneSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(sceneBuffer, 0, sceneData);

    // Splat buffer
    const maxSplats = 10000;
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
            { binding: 0, resource: { buffer: billboardUniformBuffer }},
            { binding: 1, resource: { buffer: matrixUniformBuffer }},
            { binding: 2, resource: { buffer: sceneBuffer }},
            { binding: 3, resource: { buffer: splatStorageBuffer }},
            { binding: 4, resource: { buffer: statsBuffer }},
            { binding: 5, resource: { buffer: backgroundPlaneBuffer }}
        ]
    })

    sphereRenderer.createBindGroup(matrixUniformBuffer, sceneBuffer);
    billboard.createBindGroup(billboardUniformBuffer, splatStorageBuffer, matrixUniformBuffer);

    const physicsParamsBuffer = device.createBuffer({
    label: 'physics params',
    size: 2 * 4, // dt and G
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const physicsParams = new Float32Array(2);
    physicsParams[0] = 0.016; 
    physicsParams[1] = 6.674e-3; 
    device.queue.writeBuffer(physicsParamsBuffer, 0, physicsParams);

    const physicsModule = device.createShaderModule({
        code: nbody_code,
    });

    const physicsPipeline = device.createComputePipeline({
        label: 'nbody physics',
        layout: 'auto',
        compute: {
            module: physicsModule,
        },
    });

    const physicsBindGroup = device.createBindGroup({
        label: 'physics',
        layout: physicsPipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: sceneBuffer }},
            { binding: 1, resource: { buffer: physicsParamsBuffer }},
        ]
    });

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

    let framesSinceLog = 0;
    let isRendering = false;

    function updateEyePositions(device, sceneBuffer, camera, IPD, angle, otherIPD) {
        const cameraRight = camera.right; 
        const halfIPD = IPD / 2;

        const theta = angle * Math.PI/180;

        const rotationMatrix = mat4.axisRotation(camera.front, theta);

        const leftEye = vec3.sub(camera.position, vec3.mulScalar(cameraRight, halfIPD));
        const rightEye = vec3.add(camera.position, vec3.mulScalar(cameraRight, halfIPD));

        const eyeOffset = vec3.mulScalar(cameraRight, otherIPD / 2);
        const rotatedOffset = vec3.transformMat4(eyeOffset, rotationMatrix);

        const leftEyeRotated = vec3.sub(camera.position, rotatedOffset);
        const rightEyeRotated = vec3.add(camera.position, rotatedOffset);

        const eyeData = new Float32Array(16); 
        
        eyeData[0] = leftEye[0];
        eyeData[1] = leftEye[1];
        eyeData[2] = leftEye[2];
        eyeData[3] = 0.0; // padding
        
        eyeData[4] = rightEye[0];
        eyeData[5] = rightEye[1];
        eyeData[6] = rightEye[2];
        eyeData[7] = 0.0; // padding

        eyeData[8]  = leftEyeRotated[0];
        eyeData[9]  = leftEyeRotated[1];
        eyeData[10] = leftEyeRotated[2];
        eyeData[11] = 0.0; // padding

        eyeData[12] = rightEyeRotated[0];
        eyeData[13] = rightEyeRotated[1];
        eyeData[14] = rightEyeRotated[2];
        eyeData[15] = 0.0; // padding
        
        device.queue.writeBuffer(sceneBuffer, 0, eyeData);
    }

    function createBillboardMatrix(camera, distance = VIEWING_DISTANCE) {

        const position = vec3.add(
            camera.position, 
            vec3.mulScalar(camera.front, distance)
        );
        
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
    const r = mat4.rotateZ(s, 0);    
    const origin_model_matrix = r;

    async function render() {
        if (isRendering) return;
        isRendering = true; // just incase im doing things inbetween

        const deltaTime = inputHandler.update();

        renderPassDescriptor.colorAttachments[0].view =
            context.getCurrentTexture().createView();

        renderPassDescriptor.depthStencilAttachment.view = 
            depthTexture.createView();

        // deal with per frame uniforms 
        const billboardTransform = createBillboardMatrix(camera, VIEWING_DISTANCE);
        const viewMatrix = camera.getViewMatrix();
        const aspectRatio = canvas.width / canvas.height;
        const projectionMatrix = camera.getProjectionMatrix(aspectRatio);

        device.queue.writeBuffer(matrixUniformBuffer, (2 * 16) * 4, viewMatrix); 
        device.queue.writeBuffer(matrixUniformBuffer, (3 * 16) * 4, projectionMatrix);
        
        // only update the billboard model matrix per frame if we are coupling
        if (COUPLED_EYES) {
            device.queue.writeBuffer(matrixUniformBuffer, 0, billboardTransform);
            device.queue.writeBuffer(matrixUniformBuffer, (1 * 16) * 4, mat4.inverse(billboardTransform));
        };

        updateEyePositions(device, sceneBuffer, camera, IPD, settings.angle, settings.scaler * IPD);

        // updates for background plane
        // first move the plane origin to the desired distance
        // then point it in the direction such that its facing us.

        const backgroundPlaneOrigin = vec3.add(
            camera.position,
            vec3.mulScalar(camera.front, backgroundPlaneDistance)
        );

        const planeNormal = vec3.negate(camera.front);
        const planeData = new Float32Array(8);

        planeData[0] = planeNormal[0];
        planeData[1] = planeNormal[1];
        planeData[2] = planeNormal[2];
        planeData[3] = 0.0; // padding
        planeData[4] = backgroundPlaneOrigin[0];
        planeData[5] = backgroundPlaneOrigin[1];
        planeData[6] = backgroundPlaneOrigin[2];
        planeData[7] = 0.0; // padding

        device.queue.writeBuffer(backgroundPlaneBuffer, 0, planeData);

        const encoder = device.createCommandEncoder({}); 
        
        if (SIMULATING) {
            const physicsPass = encoder.beginComputePass();
            physicsPass.setPipeline(physicsPipeline);
            physicsPass.setBindGroup(0, physicsBindGroup);
            physicsPass.dispatchWorkgroups(numSpheres); // One workgroup per sphere
            physicsPass.end();
        }

        encoder.clearBuffer(splatStorageBuffer, 0, 4); // clear atomics
        encoder.clearBuffer(statsBuffer, 0, 12);

        profiler.writeComputeStart(encoder); 

        // generating stereogram data
        const computePass = encoder.beginComputePass();
        computePass.setPipeline(computePipeline);
        computePass.setBindGroup(0, computebindGroup);
        computePass.dispatchWorkgroups(Math.ceil(4096 / 64));
        computePass.end();

        profiler.writeComputeEnd(encoder);
        profiler.writeRenderStart(encoder);

        const pass = encoder.beginRenderPass(renderPassDescriptor);
        billboard.render(pass);
        if (RENDER_SPHERES) { 
            sphereRenderer.render(pass, numSpheres) 
        };
        pass.end();

        profiler.writeRenderEnd(encoder);
        profiler.copyBuffersForReading(encoder, splatStorageBuffer, statsBuffer);
        profiler.resolveQueries(encoder);

        const commandBuffer = encoder.finish();
        
        device.queue.submit([commandBuffer]);

        await profiler.updateStats(deltaTime);

        isRendering = false;
        requestAnimationFrame(render);
    };

    gui.add(settings, 'enableProfiling')
        .name('profiling')
        .onChange(value => profiler.setEnabled(value));
    gui.add(settings, 'logInterval', 1, 300)
        .name('interval')
        .onChange(value => profiler.setLogInterval(value));
    gui.add(settings, 'noise', 1, 5000)
        .name('noise count')
        .onChange(value => {
        settings.noise = value;
        noiseCount.set([value]);
        device.queue.writeBuffer(billboardUniformBuffer, 16, noiseCount);
    });
    gui.add(settings, 'angle', 0, 360)
        .name('baseline angle')
        .onChange(value => {
        settings.angle = -value;
    });
    gui.add(settings, 'scaler', 0.8, 1.2)
        .name('baseline multiplier')
        .onChange(value => {
        settings.scaler = -value;
    });
    gui.add(settings, 'seedCount', 0, 5 * 64)
        .name('seedc count')
        .onChange(value => {
        settings.seedCount = value;
        seedCount.set([value]);
        device.queue.writeBuffer(billboardUniformBuffer, 20, seedCount);
    });

    const observer = new ResizeObserver(
        generateObserverCallback({ 
            canvas: canvas, 
            device: device, 
            render,
            onResize: updateDepthTexture  
        })
    );
    observer.observe(canvas);
}

main()