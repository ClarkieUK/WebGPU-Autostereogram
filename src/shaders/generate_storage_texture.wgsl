@group(0) @binding(0) var tex: texture_storage_2d<rgba8unorm, write>;

struct Sphere {
    centre: vec3f, // then padded with f32
    radius: f32,
}; // 32 bytes

struct Plane {
    normal: vec3f,
} // 16 bytes

struct Ray {
    origin: vec3f, // then padded with f32
    direction: vec3f,
} // 32 bytes

struct Scene {
    sphere_count: u32,
    _pad: vec3u,
    sphere: array<Sphere>,
}


fn hash1(p: f32) -> f32 {
    return fract(sin(p) * 43758.5453123);
}

fn hash3(p: f32) -> vec3f {
    return vec3f(
        hash1(p + 1.0),
        hash1(p + 2.0),
        hash1(p + 3.0),
    );
}

fn splat(r: f32, color: vec3f) -> vec4f {

    let sigma : f32 = 0.005; 

    let inv_sigma2 = 1.0 / (2.0 * sigma * sigma);

    let closeness  = exp(-r * r * inv_sigma2);

    return vec4f((closeness) * color, 1.0);
}

@compute @workgroup_size(1) fn cs( @builtin(global_invocation_id) id : vec3u )  {
    
    let color = hash3(534897);

    let size = textureDimensions(tex);

    let pos = id.xy;

    let centre = vec2f(0.5,0.5);
    
    let uv  = (vec2f(pos) + 0.5) / vec2f(size); // move to centre of pixels, normalise.

    let dist = sqrt(dot(uv-centre,uv-centre));

    textureStore(tex, pos, splat(dist, color));
    
}