// @ts-nocheck
export class GPUProfiler {
    constructor(device) {
        this.device = device;
        this.querySet = null;
        this.resolveBuffer = null;
        this.resultBuffer = null;
        this.capacity = 8; // number of timestamp pairs 
        this.init();
    }

    init() {
        // query set for timestamps
        this.querySet = this.device.createQuerySet({
            type: 'timestamp',
            count: this.capacity * 2, // pairs of start/end
        });

        // resolve queries into
        this.resolveBuffer = this.device.createBuffer({
            size: this.capacity * 2 * 8, // 8 bytes per timestamp
            usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
        });

        // read results on CPU
        this.resultBuffer = this.device.createBuffer({
            size: this.capacity * 2 * 8,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
    }

    // read timing results
    async getResults() {
        await this.resultBuffer.mapAsync(GPUMapMode.READ);
        const times = new BigInt64Array(this.resultBuffer.getMappedRange());
        
        const results = [];
        for (let i = 0; i < this.capacity; i++) {
            const start = times[i * 2];
            const end = times[i * 2 + 1];
            if (start !== 0n && end !== 0n) {
                results.push({
                    index: i,
                    durationNs: Number(end - start),
                    durationMs: Number(end - start) / 1_000_000,
                });
            }
        }
        
        this.resultBuffer.unmap();
        return results;
    }

    destroy() {
        this.querySet.destroy();
        this.resolveBuffer.destroy();
        this.resultBuffer.destroy();
    }
}