struct Sphere {
    centre: vec3f,
    radius: f32,  
}; 

struct Plane {
    normal: vec3f, 
    origin: vec3f, 
} 

const background_plane = Plane(vec3f(0.0,0.0,-1.0),vec3f(0.0,0.0,-3.0));

struct Ray {
    origin: vec3f, 
    direction: vec3f, 
} 

struct Scene {
    left_eye: vec4f,
    right_eye: vec4f,
    sphere_count: u32,
    spheres: array<Sphere>,
}

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

fn hash1(p: f32) -> f32 {
    return fract(sin(p) * 43758.5453123);
}

fn write_splat(uv: vec2f, seed_id: u32) {
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return; }
    
    let idx = atomicAdd(&splats.count, 1u);
    splats.points[idx] = SplatPoint(uv, seed_id);
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

fn trace_scene(ray: Ray) -> f32 {
    var min_t = 999999.0;
    var hit = false;
    
    // Check all spheres
    for (var i = 0u; i < scene.sphere_count; i++) {
        let t = intersect_sphere(ray, scene.spheres[i]);
        if (t > 0.0 && t < min_t) {
            min_t = t;
            hit = true;
        }
    }
    
    // Check background plane if you have one
    let plane_t = intersect_plane(ray, background_plane);
    if (plane_t > 0.0 && plane_t < min_t) { min_t = plane_t; hit = true; }
    
    if (!hit) { return -1.0; }
    return min_t;
}

fn chain_direction(start_uv: vec2f, seed_id: u32, eye_pos: vec3f, direction: f32) {
    var current_uv = start_uv;
    
    for (var iter = 0u; iter < 500u; iter++) {
        let world_pos = uv_to_world(current_uv);
        let ray = Ray(eye_pos, normalize(world_pos - eye_pos));
        
        let t = trace_scene(ray);
        if (t < 0.0) { break; }
        
        let scene_hit_pos = ray.origin + ray.direction * t;
        
        // Get opposite eye
        let other_eye = select(scene.right_eye.xyz, scene.left_eye.xyz, direction > 0.0);
        let verify_ray = Ray(other_eye, normalize(scene_hit_pos - other_eye));
        let verify_t = trace_scene(verify_ray);
        
        if (verify_t < 0.0) { break; }
        
        let verify_pos = verify_ray.origin + verify_ray.direction * verify_t;
        if (distance(scene_hit_pos, verify_pos) > 0.01) { break; }
        
        let next_uv = get_rect_intersect(scene_hit_pos, other_eye);
        if (next_uv.x < 0.0 || next_uv.x > 1.0) { break; }
        
        write_splat(next_uv, seed_id);
        current_uv = next_uv;
    }
}


@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> scene: Scene;
@group(0) @binding(2) var<storage, read_write> splats: SplatBuffer;


const NUM_SEEDS: u32 = 500u;

@compute @workgroup_size(64) 
fn cs(@builtin(global_invocation_id) id: vec3u) {
    let seed_id = id.x;
    if (seed_id >= NUM_SEEDS) { return; }
    
    // Generate random seed position
    let seed_uv = vec2f(
        hash1(f32(seed_id)),
        hash1(f32(seed_id) + 100.0)
    );
    
    // Trace from left eye through seed point
    let world_pos = uv_to_world(seed_uv);
    let left_ray = Ray(scene.left_eye.xyz, normalize(world_pos - scene.left_eye.xyz));
    let t = trace_scene(left_ray);
    
    if (t < 0.0) { return; }  // Didn't hit anything
    
    let scene_hit = left_ray.origin + left_ray.direction * t;
    
    // Verify from right eye
    let right_ray = Ray(scene.right_eye.xyz, normalize(scene_hit - scene.right_eye.xyz));
    let right_t = trace_scene(right_ray);
    
    if (right_t < 0.0) { return; }  // Occluded
    
    let right_verify = right_ray.origin + right_ray.direction * right_t;
    if (distance(scene_hit, right_verify) > 0.01) { return; }  // Mismatch
    
    // Find corresponding point on rectangle from right eye
    let right_uv = get_rect_intersect(scene_hit, scene.right_eye.xyz);
    
    // Write initial pair
    write_splat(seed_uv, seed_id);
    write_splat(right_uv, seed_id);
    
    // Chain in both directions
    chain_direction(right_uv, seed_id, scene.right_eye.xyz, 1.0);   // Rightward
    chain_direction(seed_uv, seed_id, scene.left_eye.xyz, -1.0);    // Leftward
}