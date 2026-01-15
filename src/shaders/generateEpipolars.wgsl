struct Sphere {
    centre: vec3f,
    radius: f32,  
}; 

struct Plane {
    normal: vec3f, 
    origin: vec3f, 
} 

struct Ray {
    origin: vec3f, 
    direction: vec3f, 
} 

struct Scene {
    left_eye: vec4f,
    right_eye: vec4f,
    sphere_count: u32,
    sphere: array<Sphere>,
}

struct Uniforms {
    resolution: vec2f,
    translation: vec2f,
    dim: vec2f,
};

fn intersect_sphere(ray: Ray, sphere: Sphere) -> f32 {
    let oc = sphere.centre - ray.origin;
    let a = dot(ray.direction, ray.direction);
    let b = -2.0 * dot(oc, ray.direction);
    let c = dot(oc, oc) - sphere.radius * sphere.radius;
    let discriminant = b*b - 4.0*a*c;
    
    if (discriminant < 0.0) { return -1.0; } // no hit
    
    // return smallest t, t1 < t2
    let t1 = (-b - sqrt(discriminant)) / (2.0*a);
    let t2 = (-b + sqrt(discriminant)) / (2.0*a);
    
    if (t1 > 0.0) { return t1; }
    if (t2 > 0.0) { return t2; }
    return -1.0;
}

fn intersect_plane(ray: Ray, plane: Plane) -> f32 {
    let denom = dot(plane.normal, ray.direction);
    if (abs(denom) < 0.0001) { return -1.0; }
    
    let t = dot(plane.origin - ray.origin, plane.normal) / denom;
    if (t < 0.0) { return -1.0; }
    return t;
}

fn uv_to_world(uv: vec2f) -> vec3f {
    return vec3f(uniforms.translation + uv * uniforms.dim, 0.0); 
}

fn get_rect_intersect(world_pos: vec3f, eye_pos: vec3f) -> vec2f {
    // Ray from eye through world_pos
    let dir = normalize(world_pos - eye_pos);
    
    // Intersect with clipspace rectangle plane
    // Assuming rect is at specific Z depth, adjust to your setup
    let t = (0.0 - eye_pos.z) / dir.z;
    if (t < 0.0) { return vec2f(-999.0); }  // Behind eye
    
    let intersection = eye_pos + dir * t;
    
    let uv = (intersection.xy - uniforms.translation) / uniforms.dim;

    return uv;
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read_write> data: array<f32>;


const NUM_SEEDS: u32 = 50u;

@compute @workgroup_size(1) 
fn cs( @builtin(global_invocation_id) id : vec3u )  {
    
    let i = id.x;
    let foo = data[0];
    let bar = uniforms.dim;

}

fn hash1(p: f32) -> f32 {
    return fract(sin(p) * 43758.5453123);
}