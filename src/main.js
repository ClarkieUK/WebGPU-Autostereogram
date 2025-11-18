// @ts-nocheck 

import { initGPU } from "./core/gpuDevice";
import GUI from 'https://muigui.org/dist/0.x/muigui.module.js';
import { rand } from "./utils/rand";

async function main(){

    // init canvas and gpu related shebang
    const canvas = document.querySelector('canvas')
    const {device, context, format} = await initGPU(canvas);

    // shader pipeline
    let shaderCode = await(await fetch('src/shaders/texture.wgsl')).text();

    const textureModule = device.createShaderModule({
        label: 'texture module',
        code: shaderCode,
    })

    const pipeline = device.createRenderPipeline({
        label: 'texture pipeline',
        layout: 'auto',
        vertex: {
            module: textureModule,
        },
        fragment: {
            module: textureModule,
            targets: [{format: format}]
        }
    })

    // texture data
    const kTextureWidth = 500;
    const kTextureHeight = 500;
    const _ = [255, 0, 0, 255];
    const y = [255, 255, 0, 255];
    const b = [0, 0, 255, 255];
    
    
    /*const textureData = new Uint8Array([
    _, _, _, _, _,
    _, y, _, _, _,
    _, y, _, _, _,
    _, y, y, _, _,
    _, y, _, _, _,
    _, y, y, y, _,
    b, _, _, _, _,
    ].flat()); */


    const data = [];

    for (let i = 0; i < kTextureWidth * kTextureHeight; i++) {
        let onOrOff = Math.round(Math.random()) * 255;
        data.push(onOrOff, onOrOff, onOrOff, 255);
    }


    const hdelta = 1 / kTextureWidth;
    const vdelta = 1 / kTextureHeight;

    const baseline = [0.66,0.0,0.0]
    
    const leftEye = [0.5 - baseline[0]/2, 0.5, -2]
    const rightEye = [0.5 + baseline[0]/2, 0.5, -2]

    let planeZ = 1;// +Z IS INTO THE SCREEN, IDK WHY ITS ONLY NICE WHEN PZ > 0
    let planeBoundLower = 0.3
    let planeBoundUpper = 0.6

    const screenZ = 0;
    // take a snapshot of the original texture data to read from while writing into `data`
    const originalData = data.slice();

    for (let i = 0; i<kTextureHeight; i++) // row
    {
        for (let j = 0; j<kTextureWidth; j++) // column
        {
            // centre of texel
            let x = (j+1/2) * hdelta;
            let y = (i+1/2) * vdelta;
            let z = screenZ;

            let pixelScreenPosition = [x, y, z];

            // A -> B == B - A
            let rayDir = pixelScreenPosition.map((v, i) => v - leftEye[i]);

            // avoid inf
            if (rayDir[2] === 0) continue;

            let t = (planeZ - leftEye[2]) / rayDir[2];
            let hitPoint = rayDir.map((D, i) => leftEye[i] + t * D);

            let hitX = hitPoint[0];
            let hitY = hitPoint[1];

            if (hitX >= planeBoundLower && hitX <= planeBoundUpper &&
                hitY >= planeBoundLower+0.2 && hitY <= planeBoundUpper+0.3)
            {
                let leftIndex = (i * kTextureWidth + j) * 4 // gone through i rows and j columns of 4 colour values;

                // go to same hitpoint with right eye ray
                let rayDirR = hitPoint.map((v, idx) => v - rightEye[idx]);

                if (rayDirR[2] === 0) continue;

                // IMPORTANT: intersect with screenZ (0), not planeZ
                let tR = (screenZ - rightEye[2]) / rayDirR[2];
                let pixelScreenR = rayDirR.map((v, idx) => rightEye[idx] + tR * v);

                // use floor mapping to get integer texel coords
                let jR = Math.floor((pixelScreenR[0] / hdelta)); // remove 1+2 factor (1.5 -> 1 | 0.495/0.33 -> 1, for 3x3 grid)
                let iR = Math.floor((pixelScreenR[1] / vdelta));

                pixelScreenR[0] = (jR+1/2) * hdelta; // dont really need these but nice to have I guess?
                pixelScreenR[1] = (iR+1/2) * vdelta;

                if (jR >= 0 && jR < kTextureWidth && iR >= 0 && iR < kTextureHeight) { // for a 3x3 grid i,j are in [0,1,2]
                    let rightIndex = (iR * kTextureWidth + jR) * 4; // 4 values for each point on row and up to jR in column

                    for (let k = 0; k < 4; k++) {
                        data[rightIndex + k] = originalData[leftIndex + k];
                        
                        //data[leftIndex + k] = 0
                        //data[rightIndex + k] = 170
                    }
                } else {
                    
                    //for (let k = 0; k < 4; k++) {
                    //    data[leftIndex + k] = 0;
                    //}
                }
            }
        }
    }
    
    const textureData = new Uint8Array(data)

    const texture = device.createTexture({
        size: [kTextureWidth, kTextureHeight],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    })

    device.queue.writeTexture(
        { texture },
        textureData, 
        { bytesPerRow: kTextureWidth * 4 },
        { width: kTextureWidth, height: kTextureHeight },
    )

    // since we want to use multiple samplers , need multiple bind groups

    const bindGroups = [];

    for (let i = 0; i < 8; i++) {
        
        const sampler = device.createSampler({
            addressModeU: (i & 1) ? 'repeat' : 'clamp-to-edge',
            addressModeV: (i & 2) ? 'repeat' : 'clamp-to-edge',
            magFilter: (i & 4) ? 'linear' : 'nearest',
        });
        
        const bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: sampler },
                { binding: 1, resource: texture.createView() }
            ]
        })

        bindGroups.push(bindGroup)
    }

    // render desciptor
    const renderPassDescriptor = {
        label: 'our basic canvas renderPass',
        colorAttachments: [
            {
                view: undefined,
                clearValue: [0.3, 0.3, 0.3, 1],
                loadOp: 'clear',
                storeOp: 'store',
            }
        ]
    }

    const settings = {
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
        magFilter: 'nearest',
    }

    const addressOptions = ['repeat', 'clamp-to-edge'];
    const filterOptions = ['nearest', 'linear'];
    
    const gui = new GUI();
    gui.onChange(render);
    Object.assign(gui.domElement.style, {right: '', left: '15px'});
    gui.add(settings, 'addressModeU', addressOptions);
    gui.add(settings, 'addressModeV', addressOptions);
    gui.add(settings, 'magFilter', filterOptions);

    function render() {
        const ndx = (settings.addressModeU === 'repeat' ? 1 : 0) +
                    (settings.addressModeV === 'repeat' ? 2 : 0) +
                    (settings.magFilter === 'linear' ? 4 : 0);

        const bindGroup = bindGroups[ndx];

        renderPassDescriptor.colorAttachments[0].view =
            context.getCurrentTexture().createView()

        const encoder = device.createCommandEncoder({
            label: 'render quad encoder',
        })

        const pass = encoder.beginRenderPass(renderPassDescriptor);
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(6);
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
            // re-render
            render();
            }
        });
    observer.observe(canvas);
}

main();

// got to magfilter 