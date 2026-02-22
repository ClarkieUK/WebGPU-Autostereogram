struct Uniforms {
    resolution: vec2f,
    dimensions: vec2f,
    noiseCount: f32,
    seedCount: f32,
    referenceBaseline: f32,
};

struct MatrixUniforms {
    model: mat4x4<f32>,
    inverse_model: mat4x4<f32>,
    view: mat4x4<f32>,
    projection: mat4x4<f32>,
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
@group(0) @binding(1) var<storage, read_write> splats: SplatBuffer; // from compute shader
@group(0) @binding(2) var<uniform> matrixUniforms: MatrixUniforms;

struct Vertex {
    @location(0) position: vec2f,
    @location(1) texCoord: vec2f,
}

struct ourVsOutput {
    @builtin(position) position: vec4f,
    @location(0) texCoord: vec2f,
}
/*
@vertex fn vs(vert: Vertex) -> ourVsOutput {

    // gl_Position = projection * view * model * vec4(aPos.x,aPos.y,aPos.z, 1.0);
    // reminding myself of c++ / opengl implementation

    let worldPosition = matrixUniforms.model * vec4f(vert.position, 0.0, 1.0);
    
    let clipX = worldPosition.x / (uniforms.resolution.x / uniforms.resolution.y);
    let clipY = worldPosition.y;

    var output: ourVsOutput;
    output.position = vec4f(clipX, clipY, 0.0, 1.0);
    output.texCoord = vert.texCoord;
    return output;
}*/

@vertex fn vs(vert: Vertex) -> ourVsOutput {
    let worldPos = matrixUniforms.model * vec4f(vert.position, 0.0, 1.0);
    
    let foo = matrixUniforms.projection * matrixUniforms.view * matrixUniforms.model * vec4f(vert.position, 0.0, 1.0);

    // Always project as if monitor is 0.6m * 0.35m
    let clipX = worldPos.x / (uniforms.resolution.x / 2);  // (0.6 / 2.0)
    let clipY = worldPos.y / (uniforms.resolution.y / 2); // (0.35 / 2.0)
    
    var output: ourVsOutput;
    output.position = foo; //vec4f(clipX, clipY, 0.0, 1.0);
    output.texCoord = vert.texCoord;
    return output;
}
/* fun tiliing */ 
/*
@fragment fn fs(fsInput: ourVsOutput) -> @location(0) vec4f {
    let num_splats = atomicLoad(&splats.count);
    
    let vertex_pos = vec2f(
        fsInput.texCoord.x * uniforms.dimensions.x - uniforms.dimensions.x / 2.0,
        fsInput.texCoord.y * uniforms.dimensions.y - uniforms.dimensions.y / 2.0
    );
    let frag_world_pos = (matrixUniforms.model * vec4f(vertex_pos, 0.0, 1.0)).xyz;
    
    // Find two closest splats
    var min_dist1 = 999999.0;
    var min_dist2 = 999999.0;
    var closest_seed_id = 0u;
    
    for (var i = 0u; i < num_splats; i++) {
        let splat = splats.points[i];
        
        let splat_vertex_pos = vec2f(
            splat.uv.x * uniforms.dimensions.x - uniforms.dimensions.x / 2.0,
            splat.uv.y * uniforms.dimensions.y - uniforms.dimensions.y / 2.0
        );
        let splat_world_pos = (matrixUniforms.model * vec4f(splat_vertex_pos, 0.0, 1.0)).xyz;
        
        let dist = distance(frag_world_pos, splat_world_pos);
        
        if (dist < min_dist1) {
            min_dist2 = min_dist1;
            min_dist1 = dist;
            closest_seed_id = splat.seed_id;
        } else if (dist < min_dist2) {
            min_dist2 = dist;
        }
    }
    
    let seed_color = hash3(f32(closest_seed_id));
    
    // Edge detection: if two closest distances are similar, we're near an edge
    let edge_threshold = 0.002;  // adjust for edge thickness
    let edge_factor = smoothstep(0.0, edge_threshold, min_dist2 - min_dist1);
    
    // Darken edges
    let final_color = seed_color * edge_factor;
    
    return vec4f(final_color*2, 1.0);
}*/

/* Classic dots with no culling */ /*
@fragment fn fs(fsInput: ourVsOutput) -> @location(0) vec4f {
    var color = vec4f(0.0);
    
    let num_splats = atomicLoad(&splats.count);
    
    // convert current fragment's UV to world position
    let vertex_pos = vec2f(
        fsInput.texCoord.x * uniforms.dimensions.x - uniforms.dimensions.x / 2.0,
        fsInput.texCoord.y * uniforms.dimensions.y - uniforms.dimensions.y / 2.0
    );
    let frag_world_pos = (matrixUniforms.model * vec4f(vertex_pos, 0.0, 1.0)).xyz;
    
    // fixed world-space sigma
    let sigma = 0.0023;
    
    for (var i = 0u; i < num_splats; i++) {
        let splat = splats.points[i];
        
        // convert splat UV to world position
        let splat_vertex_pos = vec2f(
            splat.uv.x * uniforms.dimensions.x - uniforms.dimensions.x / 2.0,
            splat.uv.y * uniforms.dimensions.y - uniforms.dimensions.y / 2.0
        );
        let splat_world_pos = (matrixUniforms.model * vec4f(splat_vertex_pos, 0.0, 1.0)).xyz;
        
        // distance in world space
        let dist = distance(frag_world_pos, splat_world_pos);
        
        let weight = exp(-(dist * dist) / (2.0 * sigma * sigma));
        
        let seed_color = hash3(f32(splat.seed_id));
        
        color += vec4f(seed_color * weight, weight);
    }
    
    return vec4f(color.rgb, 1.0);
}*/

// culling version -> 

@fragment fn fs(fsInput: ourVsOutput) -> @location(0) vec4f {
    var color = vec4f(0.0);
    
    let num_splats = atomicLoad(&splats.count);

    let vertex_pos = vec2f(
        fsInput.texCoord.x * uniforms.dimensions.x - uniforms.dimensions.x / 2.0,
        fsInput.texCoord.y * uniforms.dimensions.y - uniforms.dimensions.y / 2.0
    );

    let frag_world_pos = (matrixUniforms.model * vec4f(vertex_pos, 0.0, 1.0)).xyz;
    
    let sigma = 0.0023;
    let two_sigma_sq = 2.0 * sigma * sigma; 
    
    let cutoff_distance = 3.0 * sigma; 
    let cutoff_distance_sq = cutoff_distance * cutoff_distance;
    
    var contributions = 0u; 
    
    for (var i = 0u; i < num_splats; i++) {
        let splat = splats.points[i];
        
        let splat_vertex_pos = vec2f(
            splat.uv.x * uniforms.dimensions.x - uniforms.dimensions.x / 2.0,
            splat.uv.y * uniforms.dimensions.y - uniforms.dimensions.y / 2.0
        );
        let splat_world_pos = (matrixUniforms.model * vec4f(splat_vertex_pos, 0.0, 1.0)).xyz;
        
        let diff = frag_world_pos - splat_world_pos;
        let dist_sq = dot(diff, diff);
        
        if (dist_sq > cutoff_distance_sq) { 
            continue; 
        }
        
        contributions++;
        
        let weight = exp(-dist_sq / two_sigma_sq);
        
        let seed_color = hash3(f32(splat.seed_id));
        
        color += vec4f(seed_color * weight, weight);
    }

    let noise_count = u32(uniforms.noiseCount);
    for (var n = 0u; n < noise_count; n++) {
        // Use different primes and offsets to decorrelate x and y
        let noise_seed = f32(n);
        let random_x = hash1(noise_seed * 73.12 + 15.789) * uniforms.dimensions.x - uniforms.dimensions.x / 2.0;
        let random_y = hash1(noise_seed * 139.71 + 283.456) * uniforms.dimensions.y - uniforms.dimensions.y / 2.0;
        
        let noise_vertex_pos = vec2f(random_x, random_y);
        let noise_world_pos = (matrixUniforms.model * vec4f(noise_vertex_pos, 0.0, 1.0)).xyz;
        
        let diff = frag_world_pos - noise_world_pos;
        let dist_sq = dot(diff, diff);
        
        if (dist_sq <= cutoff_distance_sq) {
            let weight = exp(-dist_sq / two_sigma_sq);
            let noise_color = hash3(noise_seed * 197.3 + 412.89);
            color += vec4f(noise_color * weight, 1.0);
        }
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