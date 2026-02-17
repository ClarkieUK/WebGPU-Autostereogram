// @ts-nocheck
// cpuIntegrator.js
//
// CPU mirror of integrator.wgsl — single-threaded Dormand-Prince RK5 n-body.
// Reads/writes directly from scene.sceneData (same Float32Array the GPU uses).
// Results are discarded — exists only to measure wall-clock time.

const v3 = {
    add:   (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]],
    sub:   (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]],
    scale: (a, s) => [a[0]*s,    a[1]*s,    a[2]*s   ],
    dot:   (a, b) =>  a[0]*b[0] + a[1]*b[1] + a[2]*b[2],
    addScale: (a, b, s) => [a[0]+b[0]*s, a[1]+b[1]*s, a[2]+b[2]*s],
};

export class CPUIntegrator {
    run(scene, dt = 0.016, G = 6.674e-4) {
        const t0 = performance.now();

        const sd = scene.sceneData;
        const sphereCount = new Uint32Array(sd.buffer, 16 * 4, 1)[0];
        const base = 20; 
        const stride = 8;

        const spheres = [];
        for (let i = 0; i < sphereCount; i++) {
            const o = base + i * stride;
            spheres.push({
                pos:  [sd[o],   sd[o+1], sd[o+2]],
                r:     sd[o+3],
                vel:  [sd[o+4], sd[o+5], sd[o+6]],
                mass:  sd[o+7],
            });
        }

        const computeAcceleration = (pos_i, pos_j, mass_j) => {
            const dr = v3.sub(pos_j, pos_i);
            const dist_sq = v3.dot(dr, dr) + 1e-4;
            const dist = Math.sqrt(dist_sq);
            return v3.scale(dr, G * mass_j / (dist * dist * dist));
        };

        const computeTotalAccel = (this_body, test_pos) => {
            let accel = [0, 0, 0];
            for (let j = 0; j < sphereCount; j++) {
                if (j === this_body) continue;
                const a = computeAcceleration(test_pos, spheres[j].pos, spheres[j].mass);
                accel = v3.add(accel, a);
            }
            return accel;
        };

        const dormandPrince = (i, r0, v0) => {
            const accel = (pos) => computeTotalAccel(i, pos);

            // k1
            const drs1 = v3.scale(v0, dt);
            const dvs1 = v3.scale(accel(r0), dt);

            // k2
            const r2 = v3.add(r0, v3.scale(drs1, 1/5));
            const v2 = v3.add(v0, v3.scale(dvs1, 1/5));
            const drs2 = v3.scale(v2, dt);
            const dvs2 = v3.scale(accel(r2), dt);

            // k3
            const r3 = v3.add(v3.add(r0, v3.scale(drs1, 3/40)),  v3.scale(drs2, 9/40));
            const v3_ = v3.add(v3.add(v0, v3.scale(dvs1, 3/40)), v3.scale(dvs2, 9/40));
            const drs3 = v3.scale(v3_, dt);
            const dvs3 = v3.scale(accel(r3), dt);

            // k4
            const r4 = v3.add(v3.add(v3.add(r0,
                v3.scale(drs1,  44/45)),
                v3.scale(drs2, -56/15)),
                v3.scale(drs3,  32/9));
            const v4 = v3.add(v3.add(v3.add(v0,
                v3.scale(dvs1,  44/45)),
                v3.scale(dvs2, -56/15)),
                v3.scale(dvs3,  32/9));
            const drs4 = v3.scale(v4, dt);
            const dvs4 = v3.scale(accel(r4), dt);

            // k5
            const r5 = v3.add(v3.add(v3.add(v3.add(r0,
                v3.scale(drs1,  19372/6561)),
                v3.scale(drs2, -25360/2187)),
                v3.scale(drs3,  64448/6561)),
                v3.scale(drs4,   -212/729));
            const v5 = v3.add(v3.add(v3.add(v3.add(v0,
                v3.scale(dvs1,  19372/6561)),
                v3.scale(dvs2, -25360/2187)),
                v3.scale(dvs3,  64448/6561)),
                v3.scale(dvs4,   -212/729));
            const drs5 = v3.scale(v5, dt);
            const dvs5 = v3.scale(accel(r5), dt);

            // k6
            const r6 = v3.add(v3.add(v3.add(v3.add(v3.add(r0,
                v3.scale(drs1,  9017/3168)),
                v3.scale(drs2,  -355/33)),
                v3.scale(drs3, 46732/5247)),
                v3.scale(drs4,    49/176)),
                v3.scale(drs5, -5103/18656));
            const v6 = v3.add(v3.add(v3.add(v3.add(v3.add(v0,
                v3.scale(dvs1,  9017/3168)),
                v3.scale(dvs2,  -355/33)),
                v3.scale(dvs3, 46732/5247)),
                v3.scale(dvs4,    49/176)),
                v3.scale(dvs5, -5103/18656));
            const drs6 = v3.scale(v6, dt);
            const dvs6 = v3.scale(accel(r6), dt);

            const newPos = v3.add(v3.add(v3.add(v3.add(v3.add(r0,
                v3.scale(drs1,    35/384)),
                v3.scale(drs3,   500/1113)),
                v3.scale(drs4,  -125/192)), 
                v3.scale(drs5, -2187/6784)),
                v3.scale(drs6,    11/84));

            const newVel = v3.add(v3.add(v3.add(v3.add(v3.add(v0,
                v3.scale(dvs1,    35/384)),
                v3.scale(dvs3,   500/1113)),
                v3.scale(dvs4,  -125/192)),
                v3.scale(dvs5, -2187/6784)),
                v3.scale(dvs6,    11/84));

            return { pos: newPos, vel: newVel };
        };

        const results = [];
        for (let i = 0; i < sphereCount; i++) {
            results.push(dormandPrince(i, spheres[i].pos, spheres[i].vel));
        }

        return performance.now() - t0;
    }
}