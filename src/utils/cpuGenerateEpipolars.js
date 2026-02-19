// @ts-nocheck
const _pool = Array.from({length: 64}, () => new Float32Array(3));
let _pi = 0;
const tmp = () => _pool[_pi++ & 63];

const set3   = (o, x, y, z) => { o[0]=x; o[1]=y; o[2]=z; return o; };
const add3   = (a, b) => set3(tmp(), a[0]+b[0], a[1]+b[1], a[2]+b[2]);
const sub3   = (a, b) => set3(tmp(), a[0]-b[0], a[1]-b[1], a[2]-b[2]);
const scale3 = (a, s) => set3(tmp(), a[0]*s,    a[1]*s,    a[2]*s   );
const dot3   = (a, b) =>  a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const dist3  = (a, b) => Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]);
const norm3  = (a)    => { const l = Math.hypot(a[0],a[1],a[2]) || 1; return scale3(a, 1/l); };

const _uv0 = new Float32Array(2);
const _uv1 = new Float32Array(2);

const _m4 = new Float32Array(4);

function mulM4V4into(out, m, x, y, z, w) {
    out[0] = m[0]*x + m[4]*y + m[8] *z + m[12]*w;
    out[1] = m[1]*x + m[5]*y + m[9] *z + m[13]*w;
    out[2] = m[2]*x + m[6]*y + m[10]*z + m[14]*w;
    out[3] = m[3]*x + m[7]*y + m[11]*z + m[15]*w;
    return out;
}

function hash1(p) {
    let v = ((p * 0.1031) % 1 + 1) % 1;
    v = v * v + 33.33;
    v = v * (v + v);
    return ((v % 1) + 1) % 1;
}

export class CPUEpipolarBenchmark {
    run(scene, model, invModel, dimensions, bgPlane, seedCount) {

        const sd = scene.sceneData;
        const leftEye  = new Float32Array([sd[0], sd[1], sd[2]]);
        const rightEye = new Float32Array([sd[4], sd[5], sd[6]]);
        const sphereCount = new Uint32Array(sd.buffer, 16 * 4, 1)[0];
        const [W, H] = dimensions;

        const sphPos = new Float32Array(sphereCount * 3);
        const sphR   = new Float32Array(sphereCount);
        for (let i = 0; i < sphereCount; i++) {
            const o = 20 + i * 8;
            sphPos[i*3]   = sd[o];
            sphPos[i*3+1] = sd[o+1];
            sphPos[i*3+2] = sd[o+2];
            sphR[i]        = sd[o+3];
        }

        const bgNx = bgPlane.normal[0], bgNy = bgPlane.normal[1], bgNz = bgPlane.normal[2];
        const bgOx = bgPlane.origin[0], bgOy = bgPlane.origin[1], bgOz = bgPlane.origin[2];

        const _wp   = new Float32Array(3);
        const _rd   = new Float32Array(3);
        const _hit  = new Float32Array(3);
        const _vrd  = new Float32Array(3);
        const _vhit = new Float32Array(3);
        const _oc   = new Float32Array(3);
        const _dir  = new Float32Array(3);
        const _wn   = new Float32Array(3);
        const _rc   = new Float32Array(3);
        const _tmp4 = new Float32Array(4);
        const _seedUV = new Float32Array(2);
        const _rightUV = new Float32Array(2);
        const _curUV   = new Float32Array(2);
        const _nextUV  = new Float32Array(2);

        const uvToWorld = (uvx, uvy, out) => {
            mulM4V4into(_tmp4, model, uvx*W - W/2, uvy*H - H/2, 0, 1);
            out[0] = _tmp4[0]; out[1] = _tmp4[1]; out[2] = _tmp4[2];
        };

        const worldToUV = (wx, wy, wz, out) => {
            mulM4V4into(_tmp4, invModel, wx, wy, wz, 1);
            out[0] = (_tmp4[0] + W/2) / W;
            out[1] = (_tmp4[1] + H/2) / H;
        };

        mulM4V4into(_tmp4, model, 0, 0, 1, 0);
        const wnLen = Math.hypot(_tmp4[0], _tmp4[1], _tmp4[2]) || 1;
        const wnx = _tmp4[0]/wnLen, wny = _tmp4[1]/wnLen, wnz = _tmp4[2]/wnLen;
        mulM4V4into(_tmp4, model, 0, 0, 0, 1);
        const rcx = _tmp4[0], rcy = _tmp4[1], rcz = _tmp4[2];

        const getRectIntersect = (wx, wy, wz, ex, ey, ez, out) => {
            const dx = wx-ex, dy = wy-ey, dz = wz-ez;
            const dl = Math.hypot(dx, dy, dz) || 1;
            const dirx = dx/dl, diry = dy/dl, dirz = dz/dl;
            const denom = wnx*dirx + wny*diry + wnz*dirz;
            if (Math.abs(denom) < 0.0001) { out[0] = -999; out[1] = -999; return; }
            const t = ((rcx-ex)*wnx + (rcy-ey)*wny + (rcz-ez)*wnz) / denom;
            if (t < 0) { out[0] = -999; out[1] = -999; return; }
            worldToUV(ex + dirx*t, ey + diry*t, ez + dirz*t, out);
        };

        const intersectSphere = (rox, roy, roz, rdx, rdy, rdz, i) => {
            const px = sphPos[i*3], py = sphPos[i*3+1], pz = sphPos[i*3+2], r = sphR[i];
            const ocx = px-rox, ocy = py-roy, ocz = pz-roz;
            const a = rdx*rdx + rdy*rdy + rdz*rdz;
            const b = -2*(ocx*rdx + ocy*rdy + ocz*rdz);
            const c = ocx*ocx + ocy*ocy + ocz*ocz - r*r;
            const disc = b*b - 4*a*c;
            if (disc < 0) return -1;
            const sq = Math.sqrt(disc);
            const t1 = (-b - sq) / (2*a);
            const t2 = (-b + sq) / (2*a);
            if (t1 > 0) return t1;
            if (t2 > 0) return t2;
            return -1;
        };

        const traceScene = (rox, roy, roz, rdx, rdy, rdz) => {
            let minT = 999999, hit = false;
            for (let i = 0; i < sphereCount; i++) {
                const t = intersectSphere(rox, roy, roz, rdx, rdy, rdz, i);
                if (t > 0 && t < minT) { minT = t; hit = true; }
            }
            const denom = bgNx*rdx + bgNy*rdy + bgNz*rdz;
            if (Math.abs(denom) >= 0.0001) {
                const pt = ((bgOx-rox)*bgNx + (bgOy-roy)*bgNy + (bgOz-roz)*bgNz) / denom;
                if (pt > 0 && pt < minT) { minT = pt; hit = true; }
            }
            return hit ? minT : -1;
        };

        const chainDirection = (curx, cury, fex, fey, fez, tex, tey, tez) => {
            let cx = curx, cy = cury;
            for (let iter = 0; iter < 50; iter++) {
                uvToWorld(cx, cy, _wp);
                const dx = _wp[0]-fex, dy = _wp[1]-fey, dz = _wp[2]-fez;
                const dl = Math.hypot(dx, dy, dz) || 1;
                const rdx = dx/dl, rdy = dy/dl, rdz = dz/dl;
                const t = traceScene(fex, fey, fez, rdx, rdy, rdz);
                if (t < 0) break;
                const hx = fex+rdx*t, hy = fey+rdy*t, hz = fez+rdz*t;
                const vdx = hx-tex, vdy = hy-tey, vdz = hz-tez;
                const vl = Math.hypot(vdx, vdy, vdz) || 1;
                const vrx = vdx/vl, vry = vdy/vl, vrz = vdz/vl;
                const vt = traceScene(tex, tey, tez, vrx, vry, vrz);
                if (vt < 0) break;
                const vhx = tex+vrx*vt, vhy = tey+vry*vt, vhz = tez+vrz*vt;
                if (Math.hypot(hx-vhx, hy-vhy, hz-vhz) > 0.01) break;
                getRectIntersect(hx, hy, hz, tex, tey, tez, _nextUV);
                if (_nextUV[0] < 0 || _nextUV[0] > 1 || _nextUV[1] < 0 || _nextUV[1] > 1) break;
                cx = _nextUV[0]; cy = _nextUV[1];
            }
        };

        const t0 = performance.now();

        for (let seed_id = 0; seed_id < seedCount; seed_id++) {
            const sux = hash1(seed_id), suy = hash1(seed_id + 100);
            uvToWorld(sux, suy, _wp);
            const dx = _wp[0]-leftEye[0], dy = _wp[1]-leftEye[1], dz = _wp[2]-leftEye[2];
            const dl = Math.hypot(dx, dy, dz) || 1;
            const rdx = dx/dl, rdy = dy/dl, rdz = dz/dl;
            const t = traceScene(leftEye[0], leftEye[1], leftEye[2], rdx, rdy, rdz);
            if (t < 0) continue;

            const hx = leftEye[0]+rdx*t, hy = leftEye[1]+rdy*t, hz = leftEye[2]+rdz*t;
            const vdx = hx-rightEye[0], vdy = hy-rightEye[1], vdz = hz-rightEye[2];
            const vl = Math.hypot(vdx, vdy, vdz) || 1;
            const vrx = vdx/vl, vry = vdy/vl, vrz = vdz/vl;
            const rt = traceScene(rightEye[0], rightEye[1], rightEye[2], vrx, vry, vrz);
            if (rt < 0) continue;
            const vhx = rightEye[0]+vrx*rt, vhy = rightEye[1]+vry*rt, vhz = rightEye[2]+vrz*rt;
            if (Math.hypot(hx-vhx, hy-vhy, hz-vhz) > 0.01) continue;

            getRectIntersect(hx, hy, hz, rightEye[0], rightEye[1], rightEye[2], _rightUV);
            chainDirection(_rightUV[0], _rightUV[1], rightEye[0], rightEye[1], rightEye[2], leftEye[0],  leftEye[1],  leftEye[2]);
            chainDirection(sux, suy,                 leftEye[0],  leftEye[1],  leftEye[2],  rightEye[0], rightEye[1], rightEye[2]);
        }

        return performance.now() - t0;
    }
}