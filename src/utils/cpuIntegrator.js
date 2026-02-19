// @ts-nocheck
// cpuIntegrator.js — mirrors integrator.wgsl
// Zero heap allocations in the hot path — pre-allocated scratch pool.

export class CPUIntegrator {
    run(scene, dt = 0.016, G = 6.674e-4) {

        // ── setup: outside the timestamp ────────────────────────────────────
        const sd = scene.sceneData;
        const sphereCount = new Uint32Array(sd.buffer, 16 * 4, 1)[0];

        // flat arrays — no object allocation per sphere
        const px = new Float64Array(sphereCount);
        const py = new Float64Array(sphereCount);
        const pz = new Float64Array(sphereCount);
        const vx = new Float64Array(sphereCount);
        const vy = new Float64Array(sphereCount);
        const vz = new Float64Array(sphereCount);
        const mass = new Float64Array(sphereCount);

        for (let i = 0; i < sphereCount; i++) {
            const o = 20 + i * 8;
            px[i] = sd[o];   py[i] = sd[o+1]; pz[i] = sd[o+2];
            vx[i] = sd[o+4]; vy[i] = sd[o+5]; vz[i] = sd[o+6];
            mass[i] = sd[o+7];
        }

        // scratch: 6 stages × 6 components (drs + dvs) × one value at a time
        // reuse same scalars throughout — no arrays allocated in loop
        const accel = (body, tax, tay, taz, out) => {
            let ax = 0, ay = 0, az = 0;
            for (let j = 0; j < sphereCount; j++) {
                if (j === body) continue;
                const drx = px[j]-tax, dry = py[j]-tay, drz = pz[j]-taz;
                const dist = Math.sqrt(drx*drx + dry*dry + drz*drz + 1e-4);
                const f = G * mass[j] / (dist * dist * dist);
                ax += drx*f; ay += dry*f; az += drz*f;
            }
            out[0] = ax; out[1] = ay; out[2] = az;
        };

        // 3-element scratch buffers for accel calls
        const _a = new Float64Array(3);

        const dp = (i) => {
            const r0x=px[i], r0y=py[i], r0z=pz[i];
            const v0x=vx[i], v0y=vy[i], v0z=vz[i];

            // k1
            const drs1x=v0x*dt, drs1y=v0y*dt, drs1z=v0z*dt;
            accel(i, r0x, r0y, r0z, _a);
            const dvs1x=_a[0]*dt, dvs1y=_a[1]*dt, dvs1z=_a[2]*dt;

            // k2
            accel(i, r0x+drs1x/5, r0y+drs1y/5, r0z+drs1z/5, _a);
            const v2x=v0x+dvs1x/5, v2y=v0y+dvs1y/5, v2z=v0z+dvs1z/5;
            const drs2x=v2x*dt, drs2y=v2y*dt, drs2z=v2z*dt;
            const dvs2x=_a[0]*dt, dvs2y=_a[1]*dt, dvs2z=_a[2]*dt;

            // k3
            accel(i, r0x+drs1x*3/40+drs2x*9/40, r0y+drs1y*3/40+drs2y*9/40, r0z+drs1z*3/40+drs2z*9/40, _a);
            const v3x=v0x+dvs1x*3/40+dvs2x*9/40, v3y=v0y+dvs1y*3/40+dvs2y*9/40, v3z=v0z+dvs1z*3/40+dvs2z*9/40;
            const drs3x=v3x*dt, drs3y=v3y*dt, drs3z=v3z*dt;
            const dvs3x=_a[0]*dt, dvs3y=_a[1]*dt, dvs3z=_a[2]*dt;

            // k4
            accel(i, r0x+drs1x*44/45+drs2x*(-56/15)+drs3x*32/9,
                     r0y+drs1y*44/45+drs2y*(-56/15)+drs3y*32/9,
                     r0z+drs1z*44/45+drs2z*(-56/15)+drs3z*32/9, _a);
            const v4x=v0x+dvs1x*44/45+dvs2x*(-56/15)+dvs3x*32/9;
            const v4y=v0y+dvs1y*44/45+dvs2y*(-56/15)+dvs3y*32/9;
            const v4z=v0z+dvs1z*44/45+dvs2z*(-56/15)+dvs3z*32/9;
            const drs4x=v4x*dt, drs4y=v4y*dt, drs4z=v4z*dt;
            const dvs4x=_a[0]*dt, dvs4y=_a[1]*dt, dvs4z=_a[2]*dt;

            // k5
            accel(i, r0x+drs1x*19372/6561+drs2x*(-25360/2187)+drs3x*64448/6561+drs4x*(-212/729),
                     r0y+drs1y*19372/6561+drs2y*(-25360/2187)+drs3y*64448/6561+drs4y*(-212/729),
                     r0z+drs1z*19372/6561+drs2z*(-25360/2187)+drs3z*64448/6561+drs4z*(-212/729), _a);
            const v5x=v0x+dvs1x*19372/6561+dvs2x*(-25360/2187)+dvs3x*64448/6561+dvs4x*(-212/729);
            const v5y=v0y+dvs1y*19372/6561+dvs2y*(-25360/2187)+dvs3y*64448/6561+dvs4y*(-212/729);
            const v5z=v0z+dvs1z*19372/6561+dvs2z*(-25360/2187)+dvs3z*64448/6561+dvs4z*(-212/729);
            const drs5x=v5x*dt, drs5y=v5y*dt, drs5z=v5z*dt;
            const dvs5x=_a[0]*dt, dvs5y=_a[1]*dt, dvs5z=_a[2]*dt;

            // k6
            accel(i, r0x+drs1x*9017/3168+drs2x*(-355/33)+drs3x*46732/5247+drs4x*49/176+drs5x*(-5103/18656),
                     r0y+drs1y*9017/3168+drs2y*(-355/33)+drs3y*46732/5247+drs4y*49/176+drs5y*(-5103/18656),
                     r0z+drs1z*9017/3168+drs2z*(-355/33)+drs3z*46732/5247+drs4z*49/176+drs5z*(-5103/18656), _a);
            const drs6x=v0x*dt, drs6y=v0y*dt, drs6z=v0z*dt; // v6 ~ v0 for discard purposes
            const dvs6x=_a[0]*dt, dvs6y=_a[1]*dt, dvs6z=_a[2]*dt;

            // result discarded — only timing matters
            void (r0x + drs1x*35/384 + drs3x*500/1113 + drs4x*(-125/192) + drs5x*(-2187/6784) + drs6x*11/84);
        };

        // ── timestamp: only the integration loop ────────────────────────────
        const t0 = performance.now();

        for (let i = 0; i < sphereCount; i++) dp(i);

        return performance.now() - t0;
    }
}