//@ts-nocheck

import {
  vec3,
  vec4,
  mat4,
} from 'https://wgpu-matrix.org/dist/3.x/wgpu-matrix.module.js';

function mass(r) {
    return 4/3 * Math.PI * r ** 3 * 500; 
}

export class Scene {
  constructor(device, IPD, viewingDistance, sceneGap, scale, sphereCount) {
    const valuesPerSphere = 8;
    const sceneSize = (20 + valuesPerSphere * sphereCount) * 4; // bytes

    this.sceneData = new Float32Array(20 + valuesPerSphere * sphereCount);
    const buffer = this.sceneData.buffer;
    const dataView = new DataView(buffer); // need this to set the integer sphere count
    // 4 + 4 + 4 + 4 + 1 + 3(pad) + 8 floats per sphere

    this.leftEyeData = this.sceneData.subarray(0, 4);
    this.rightEyeData = this.sceneData.subarray(4, 8);
    this.rotatedLeftEyeData = this.sceneData.subarray(8, 12);
    this.rotatedRightEyeData = this.sceneData.subarray(12, 16); // 0 -> 15

    dataView.setUint32(16 * 4, sphereCount, true); 

    this.sphereDataSpace = this.sceneData.subarray(20, 20 + valuesPerSphere * sphereCount);

    this.leftEyeData.set([-IPD / 2, 0, viewingDistance, 1.0]);
    this.rightEyeData.set([IPD / 2, 0, viewingDistance, 1.0]);
    this.rotatedLeftEyeData.set([0.0, 0.0, 0.0, 0.0]); // undefined until render loop calls...
    this.rotatedRightEyeData.set([0.0, 0.0, 0.0, 0.0]);

    //generateSpheres(this.sphereDataSpace, sphereCount, valuesPerSphere, scale, sceneGap);
    generatePosterExample(this.sphereDataSpace, valuesPerSphere);
    //generateSmile(this.sphereDataSpace, sphereCount, valuesPerSphere, scale, sceneGap);

    this.sceneBuffer = device.createBuffer({
        label: 'scene storage',
        size: sceneSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(this.sceneBuffer, 0, this.sceneData);

  }

  updateEyePositions(device, camera, IPD, angle, otherIPD) {
    const cameraPosition = camera.position;
    const cameraRight = camera.right;
    const cameraFront = camera.front;

    const theta = angle * Math.PI / 180;

    const rotationMatrix = mat4.axisRotation(cameraFront, theta);

    const leftEye = vec3.sub(cameraPosition, vec3.mulScalar(cameraRight, IPD / 2));
    const rightEye = vec3.add(cameraPosition, vec3.mulScalar(cameraRight, IPD / 2));

    const eyeOffset = vec3.mulScalar(cameraRight, otherIPD / 2);
    const rotatedOffset = vec3.transformMat4(eyeOffset, rotationMatrix);

    const leftEyeRotated = vec3.sub(camera.position, rotatedOffset);
    const rightEyeRotated = vec3.add(camera.position, rotatedOffset);

    this.leftEyeData.set([leftEye[0], leftEye[1], leftEye[2], 1.0]);
    this.rightEyeData.set([rightEye[0], rightEye[1], rightEye[2], 1.0]);
    this.rotatedLeftEyeData.set([leftEyeRotated[0], leftEyeRotated[1], leftEyeRotated[2], 1.0]);
    this.rotatedRightEyeData.set([rightEyeRotated[0], rightEyeRotated[1], rightEyeRotated[2], 1.0]);
    
    device.queue.writeBuffer(this.sceneBuffer, 0, this.sceneData.subarray(0, 16));
  }
};

function generateSpheres(sphereDataSpace, sphereCount, valuesPerSphere, scale, sceneGap) {
    for (let i = 0; i < sphereCount; i++) {

        const thisSphereData = sphereDataSpace.subarray(i * valuesPerSphere, (i+1) * valuesPerSphere)

        let x = (Math.random() - 0.5) * 2 * scale;
        let y = (Math.random() - 0.5) * 2 * scale;
        //let z = -Math.random() * sceneGap * scale;
        let z = -Math.random() * sceneGap * scale - 2;

        let r =  (Math.random() * 0.25);

        thisSphereData.set([x, y, z, r, 0.0, 0.0, 0.0, r])

    }
};

function generatePosterExample(sphereDataSpace, valuesPerSphere) { 

  for (let i = 0; i < 1; i++) {

      const thisSphereData = sphereDataSpace.subarray(i * valuesPerSphere, (i+1) * valuesPerSphere)

      //let x = (Math.random() > 0.5) ? 0.6 : -0.6;
      let x = 0.0;
      let y = 0.0;
      let z = -3.0 * (i+1);

      let r =  0.5;

      thisSphereData.set([x, y, z, r, 0.0, 0.0, 0.0, r])
  }
};

function generateSmile(sphereDataSpace, sphereCount, valuesPerSphere, scale, sceneGap) {
    let sphereIndex = 0;

    const placeSphere = (x, y, z, r) => {
        if (sphereIndex >= sphereCount) return;
        const thisSphereData = sphereDataSpace.subarray(
            sphereIndex * valuesPerSphere,
            (sphereIndex + 1) * valuesPerSphere
        );
        thisSphereData.set([x, y, z, r, 0.0, 0.0, 0.0, r]);
        sphereIndex++;
    };

    const baseZ = -sceneGap * scale * 0.5 - 2;
    const faceRadius = scale * 0.8;
    const sphereR = 0.08;
    const jitter = () => (Math.random() - 0.5) * 0.08;

    const faceCount = Math.floor(sphereCount * 0.45);
    for (let i = 0; i < faceCount; i++) {
        const angle = (i / faceCount) * Math.PI * 2;
        const x = Math.cos(angle) * faceRadius + jitter();
        const y = Math.sin(angle) * faceRadius + jitter();
        const z = baseZ + jitter();
        placeSphere(x, y, z, sphereR);
    }

    const eyeR = faceRadius * 0.18;
    const eyeY = faceRadius * 0.3;
    const eyeCount = Math.floor(sphereCount * 0.1);
    for (let i = 0; i < eyeCount; i++) {
        const angle = (i / eyeCount) * Math.PI * 2;
        const x = -faceRadius * 0.35 + Math.cos(angle) * eyeR + jitter();
        const y = eyeY + Math.sin(angle) * eyeR + jitter();
        const z = baseZ + jitter();
        placeSphere(x, y, z, sphereR);
    }

    for (let i = 0; i < eyeCount; i++) {
        const angle = (i / eyeCount) * Math.PI * 2;
        const x = faceRadius * 0.35 + Math.cos(angle) * eyeR + jitter();
        const y = eyeY + Math.sin(angle) * eyeR + jitter();
        const z = baseZ + jitter();
        placeSphere(x, y, z, sphereR);
    }

    const smileCount = sphereCount - sphereIndex;
    const smileRadius = faceRadius * 0.5;
    const smileStartAngle = Math.PI * 1.15;  
    const smileEndAngle   = Math.PI * 1.85;  
    for (let i = 0; i < smileCount; i++) {
        const t = i / (smileCount - 1);
        const angle = smileStartAngle + t * (smileEndAngle - smileStartAngle);
        const x = Math.cos(angle) * smileRadius + jitter();
        const y = Math.sin(angle) * smileRadius - faceRadius * 0.1 + jitter();
        const z = baseZ + jitter();
        placeSphere(x, y, z, sphereR);
    }
}

