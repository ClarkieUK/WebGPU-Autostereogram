// @ts-nocheck
import { GPUProfiler } from "./gpuProfiler";

export class Profiler {
    constructor(device, settings = {}) {
        this.device = device;
        this.gpuProfiler = new GPUProfiler(device);
        
        this.stats = {
            frameCount: 0,
            computeTimeMs: 0,
            renderTimeMs: 0,
            totalTimeMs: 0,
            avgComputeMs: 0,
            avgRenderMs: 0,
            avgTotalMs: 0,
            splatCount: 0,
            totalRays: 0,
            successfulRays: 0,
            chainIterations: 0,
        };
        
        this.enabled = settings.enableProfiling ?? true;
        this.logInterval = settings.logInterval ?? 60;
        this.framesSinceLog = 0;
        
        this.splatReadBuffer = null;
        this.statsReadBuffer = null;
        
        this.initialized = false;
    }
    
    initializeReadBuffers() {
        if (this.initialized) return;
        
        this.splatReadBuffer = this.device.createBuffer({
            label: 'splat read buffer',
            size: 1 * 4,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
        
        this.statsReadBuffer = this.device.createBuffer({
            label: 'stats read buffer',
            size: 3 * 4,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
        
        this.initialized = true;
    }
    
    writeComputeStart(encoder) {
        if (!this.enabled) return;
        encoder.writeTimestamp(this.gpuProfiler.querySet, 0);
    }
    
    writeComputeEnd(encoder) {
        if (!this.enabled) return;
        encoder.writeTimestamp(this.gpuProfiler.querySet, 1);
    }
    
    writeRenderStart(encoder) {
        if (!this.enabled) return;
        encoder.writeTimestamp(this.gpuProfiler.querySet, 2);
    }

    writeRenderEnd(encoder) {
        if (!this.enabled) return;
        encoder.writeTimestamp(this.gpuProfiler.querySet, 3);
    }
    
    copyBuffersForReading(encoder, splatStorageBuffer, statsBuffer) {
        if (!this.enabled) return;
        
        this.initializeReadBuffers();
        encoder.copyBufferToBuffer(splatStorageBuffer, 0, this.splatReadBuffer, 0, 4);
        encoder.copyBufferToBuffer(statsBuffer, 0, this.statsReadBuffer, 0, 12);
    }
    
    resolveQueries(encoder) {
        if (!this.enabled) return;
        
        encoder.resolveQuerySet(
            this.gpuProfiler.querySet, 0, 4, 
            this.gpuProfiler.resolveBuffer, 0
        );
        encoder.copyBufferToBuffer(
            this.gpuProfiler.resolveBuffer, 0,
            this.gpuProfiler.resultBuffer, 0,
            this.gpuProfiler.resultBuffer.size
        );
    }
    
    async updateStats(deltaTime) {
        if (!this.enabled) return;
        

        const timingResults = await this.gpuProfiler.getResults();
        
        if (timingResults.length >= 2) {
            const computeTime = timingResults[0].durationMs; // timestamps 0-1
            const renderTime = timingResults[1].durationMs;  // timestamps 2-3
            const totalTime = computeTime + renderTime;
            
            this.stats.frameCount++;
            this.stats.computeTimeMs += computeTime;
            this.stats.renderTimeMs += renderTime;
            this.stats.totalTimeMs += totalTime;
            
            this.stats.avgComputeMs = this.stats.computeTimeMs / this.stats.frameCount;
            this.stats.avgRenderMs = this.stats.renderTimeMs / this.stats.frameCount;
            this.stats.avgTotalMs = this.stats.totalTimeMs / this.stats.frameCount;
        }
        

        await this.splatReadBuffer.mapAsync(GPUMapMode.READ);
        const splatCountData = new Uint32Array(this.splatReadBuffer.getMappedRange());
        this.stats.splatCount = splatCountData[0];
        this.splatReadBuffer.unmap();
        
        await this.statsReadBuffer.mapAsync(GPUMapMode.READ);
        const statsData = new Uint32Array(this.statsReadBuffer.getMappedRange());
        this.stats.totalRays = statsData[0];
        this.stats.successfulRays = statsData[1];
        this.stats.chainIterations = statsData[2];
        this.statsReadBuffer.unmap();
        
        this.framesSinceLog++;
        if (this.framesSinceLog >= this.logInterval) {
            this.logStats(deltaTime);
            this.framesSinceLog = 0;
        }
    }
    
    logStats(deltaTime) {
        const cpuTimeMs = deltaTime * 1000;
        const gpuFps = 1000 / this.stats.avgTotalMs;
        const cpuFps = 1 / deltaTime;
        const raysPerSecond = this.stats.totalRays / (this.stats.avgComputeMs / 1000);
        
        console.log('Performance Stats -----------------------|');
        console.log(`Frames: ${this.stats.frameCount}`);
        console.log(`Splats: ${this.stats.splatCount}`);
        console.log(`Total rays: ${this.stats.totalRays}`);
        console.log(`Successful rays: ${this.stats.successfulRays}`);
        console.log(`Chain iterations: ${this.stats.chainIterations}`);
        console.log(`Avg Compute: ${this.stats.avgComputeMs.toFixed(3)} ms`);
        console.log(`Avg Render:  ${this.stats.avgRenderMs.toFixed(3)} ms`);
        console.log(`Avg Total (GPU):   ${this.stats.avgTotalMs.toFixed(3)} ms`);
        console.log(`Avg Total (CPU):         ${cpuTimeMs.toFixed(5)} ms`);
        console.log(`GPU FPS:         ${gpuFps.toFixed(1)}`);
        console.log(`CPU FPS:         ${cpuFps.toFixed(1)}`);
        console.log(`Theoretical rays/s: ${raysPerSecond.toExponential(2)}`);
    }
    
    reset() {
        this.stats.frameCount = 0;
        this.stats.computeTimeMs = 0;
        this.stats.renderTimeMs = 0;
        this.stats.totalTimeMs = 0;
        this.stats.avgComputeMs = 0;
        this.stats.avgRenderMs = 0;
        this.stats.avgTotalMs = 0;
        this.stats.splatCount = 0;
        this.stats.totalRays = 0;
        this.stats.successfulRays = 0;
        this.stats.chainIterations = 0;
        this.framesSinceLog = 0;
    }
    
    setEnabled(enabled) {
        this.enabled = enabled;
        if (!enabled) {
            this.reset();
        }
    }
    

    setLogInterval(interval) {
        this.logInterval = Math.max(1, interval);
    }
    

    getStats() {
        return { ...this.stats };
    }
    

    destroy() {
        if (this.splatReadBuffer) {
            this.splatReadBuffer.destroy();
        }
        if (this.statsReadBuffer) {
            this.statsReadBuffer.destroy();
        }
    }
}