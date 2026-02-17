// @ts-nocheck

const v3 = {
    sub:  (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]],
    add:  (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]],
    scale:(a, s) => [a[0]*s,    a[1]*s,    a[2]*s   ],
    dot:  (a, b) =>  a[0]*b[0] + a[1]*b[1] + a[2]*b[2],
    dist: (a, b) => Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]),
    norm: (a)    => { const l = Math.hypot(...a) || 1; return v3.scale(a, 1/l); },
};

function mulM4V4(m, v) {
    return [
        m[0]*v[0] + m[4]*v[1] + m[8] *v[2] + m[12]*v[3],
        m[1]*v[0] + m[5]*v[1] + m[9] *v[2] + m[13]*v[3],
        m[2]*v[0] + m[6]*v[1] + m[10]*v[2] + m[14]*v[3],
        m[3]*v[0] + m[7]*v[1] + m[11]*v[2] + m[15]*v[3],
    ];
}

function hash1(p) {
    let v = ((p * 0.1031) % 1 + 1) % 1;
    v = v * v + 33.33;
    v = v * (v + v);
    return ((v % 1) + 1) % 1;
}

export class CPUEpipolarBenchmark {
    run(scene, model, invModel, dimensions, bgPlane, seedCount) {
        const t0 = performance.now();

        const sd = scene.sceneData;

        const leftEye  = [sd[0], sd[1], sd[2]];
        const rightEye = [sd[4], sd[5], sd[6]];
        const sphereCount = scene.sceneData[16]; 
        const sphereCountInt = new Uint32Array(sd.buffer, 16 * 4, 1)[0];

        const spheres = [];
        const base = 20; 
        for (let i = 0; i < sphereCountInt; i++) {
            const o = base + i * 8;
            spheres.push({ pos: [sd[o], sd[o+1], sd[o+2]], r: sd[o+3] });
        }

        const [W, H] = dimensions;

        const uvToWorld = (uv) => {
            const lx = uv[0]*W - W/2;
            const ly = uv[1]*H - H/2;
            const r = mulM4V4(model, [lx, ly, 0, 1]);
            return [r[0], r[1], r[2]];
        };

        const worldToUV = (wp) => {
            const v = mulM4V4(invModel, [wp[0], wp[1], wp[2], 1]);
            return [(v[0] + W/2) / W, (v[1] + H/2) / H];
        };

        const getRectIntersect = (worldPos, eye) => {
            const dir = v3.norm(v3.sub(worldPos, eye));
            const wn4 = mulM4V4(model, [0, 0, 1, 0]);
            const wn  = v3.norm([wn4[0], wn4[1], wn4[2]]);
            const rc4 = mulM4V4(model, [0, 0, 0, 1]);
            const rc  = [rc4[0], rc4[1], rc4[2]];
            const denom = v3.dot(wn, dir);
            if (Math.abs(denom) < 0.0001) return [-999, -999];
            const t = v3.dot(v3.sub(rc, eye), wn) / denom;
            if (t < 0) return [-999, -999];
            return worldToUV(v3.add(eye, v3.scale(dir, t)));
        };

        const intersectSphere = (ro, rd, sp) => {
            const oc = v3.sub(sp.pos, ro);
            const a  = v3.dot(rd, rd);
            const b  = -2 * v3.dot(oc, rd);
            const c  = v3.dot(oc, oc) - sp.r * sp.r;
            const disc = b*b - 4*a*c;
            if (disc < 0) return -1;
            const t1 = (-b - Math.sqrt(disc)) / (2*a);
            const t2 = (-b + Math.sqrt(disc)) / (2*a);
            if (t1 > 0) return t1;
            if (t2 > 0) return t2;
            return -1;
        };

        const intersectPlane = (ro, rd) => {
            const denom = v3.dot(bgPlane.normal, rd);
            if (Math.abs(denom) < 0.0001) return -1;
            const t = v3.dot(v3.sub(bgPlane.origin, ro), bgPlane.normal) / denom;
            return t < 0 ? -1 : t;
        };

        const traceScene = (ro, rd) => {
            let minT = 999999, hit = false;
            for (let i = 0; i < sphereCountInt; i++) {
                const t = intersectSphere(ro, rd, spheres[i]);
                if (t > 0 && t < minT) { minT = t; hit = true; }
            }
            const pt = intersectPlane(ro, rd);
            if (pt > 0 && pt < minT) { minT = pt; hit = true; }
            return hit ? minT : -1;
        };

        const writeSplat = (uv) => {
            void (uv[0] >= 0 && uv[0] <= 1 && uv[1] >= 0 && uv[1] <= 1);
        };

        const chainDirection = (startUV, fromEye, toEye) => {
            let cur = startUV;
            for (let iter = 0; iter < 50; iter++) {
                const wp  = uvToWorld(cur);
                const rd  = v3.norm(v3.sub(wp, fromEye));
                const t   = traceScene(fromEye, rd);
                if (t < 0) break;
                const hit = v3.add(fromEye, v3.scale(rd, t));

                const vrd = v3.norm(v3.sub(hit, toEye));
                const vt  = traceScene(toEye, vrd);
                if (vt < 0) break;
                if (v3.dist(hit, v3.add(toEye, v3.scale(vrd, vt))) > 0.01) break;

                const nextUV = getRectIntersect(hit, toEye);
                if (nextUV[0] < 0 || nextUV[0] > 1 || nextUV[1] < 0 || nextUV[1] > 1) break;

                writeSplat(nextUV);
                cur = nextUV;
            }
        };

        for (let seed_id = 0; seed_id < seedCount; seed_id++) {
            const seedUV = [hash1(seed_id), hash1(seed_id + 100)];
            const wp     = uvToWorld(seedUV);
            const lrd    = v3.norm(v3.sub(wp, leftEye));
            const t      = traceScene(leftEye, lrd);
            if (t < 0) continue;

            const sceneHit = v3.add(leftEye, v3.scale(lrd, t));
            const rrd      = v3.norm(v3.sub(sceneHit, rightEye));
            const rt       = traceScene(rightEye, rrd);
            if (rt < 0) continue;
            if (v3.dist(sceneHit, v3.add(rightEye, v3.scale(rrd, rt))) > 0.01) continue;

            const rightUV = getRectIntersect(sceneHit, rightEye);
            writeSplat(seedUV);
            writeSplat(rightUV);

            chainDirection(rightUV, rightEye, leftEye);
            chainDirection(seedUV,  leftEye,  rightEye);
        }

        return performance.now() - t0; 
    }
}