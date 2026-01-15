struct Uniforms {
    resolution: vec2f,
    translation: vec2f,
    dim: vec2f,
};

struct SplatPoint {
    uv: vec2f,
    seed_id: u32,
}

struct SplatBuffer {
    count: atomic<u32>,
    points: array<SplatPoint>,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read_write> splats: SplatBuffer;

struct Vertex {
    @location(0) position: vec2f,
    @location(1) texCoord: vec2f,
}

struct ourVsOutput {
    @builtin(position) position: vec4f,
    @location(0) texCoord: vec2f,
}

@vertex fn vs(vert: Vertex) -> ourVsOutput {
    var position = vert.position + uniforms.translation;
    position = position / uniforms.resolution;
    position = position * 2.0;
    position = position - 1.0;
    position = position * vec2f(1, -1);
    
    var output: ourVsOutput;
    output.position = vec4f(position, 0.0, 1.0);
    output.texCoord = vert.texCoord;
    return output;
}

@fragment fn fs(fsInput: ourVsOutput) -> @location(0) vec4f {
    var color = vec4f(0.0);
    
    let num_splats = atomicLoad(&splats.count);
    
    // Loop through all splats
    for (var i = 0u; i < num_splats; i++) {
        let splat = splats.points[i];
        let dist = distance(fsInput.texCoord, splat.uv);
        
        // Gaussian splat
        let sigma = 0.005;
        let weight = exp(-(dist * dist) / (2.0 * sigma * sigma));
        
        // Random color per seed_id
        let seed_color = hash3(f32(splat.seed_id));
        
        color += vec4f(seed_color * weight, weight);
    }
    
    return vec4f(color.rgb, 1.0);
}

fn hash1(p: f32) -> f32 {
    return fract(sin(p) * 43758.5453123);
}

fn hash3(p: f32) -> vec3f {
    return vec3f(
        hash1(p + 1.0),
        hash1(p + 2.0),
        hash1(p + 3.0)
    );
}