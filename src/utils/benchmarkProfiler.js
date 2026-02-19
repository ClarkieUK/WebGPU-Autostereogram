// @ts-nocheck

export class BenchmarkLogger {
    constructor() {
        this._epipolar = [];
        this._physics  = [];
    }

    record({ sphereCount, seedCount, splatCount, gpuMs, cpuMs }) {
        this._epipolar.push({ sphereCount, seedCount, splatCount, gpuMs, cpuMs });
    }

    recordPhysics({ sphereCount, gpuMs, cpuMs }) {
        this._physics.push({ sphereCount, gpuMs, cpuMs });
    }

    downloadCSV(numSpheres) {
        const header = 'sphere_count,seed_count,splat_count,gpu_compute_ms,cpu_compute_ms';
        const lines  = this._epipolar.map(r =>
            `${r.sphereCount},${r.seedCount},${r.splatCount},${r.gpuMs.toFixed(4)},${r.cpuMs.toFixed(4)}`
        );
        this._triggerDownload([header, ...lines].join('\n'), `${numSpheres.toString()}_epipolar_benchmark.csv`);
    }

    downloadPhysicsCSV(numSpheres) {
        const header = 'sphere_count,gpu_physics_ms,cpu_physics_ms';
        const lines  = this._physics.map(r =>
            `${r.sphereCount},${r.gpuMs.toFixed(4)},${r.cpuMs.toFixed(4)}`
        );
        this._triggerDownload([header, ...lines].join('\n'), `${numSpheres.toString()}_physics_benchmark.csv`);
    }

    _triggerDownload(csv, filename) {
        const blob = new Blob([csv], { type: 'text/csv' });
        const a    = Object.assign(document.createElement('a'), {
            href:     URL.createObjectURL(blob),
            download: filename,
        });
        a.click();
        URL.revokeObjectURL(a.href);
    }

    get count()        { return this._epipolar.length; }
    get physicsCount() { return this._physics.length;  }
}