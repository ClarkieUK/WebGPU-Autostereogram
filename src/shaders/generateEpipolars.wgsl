struct Uniforms {
    resolution: vec2f,
    dimensions: vec2f,
    noiseCount: f32,
    seedCount: f32,
};

struct MatrixUniforms {
    model: mat4x4<f32>,
    inverse_model: mat4x4<f32>,
    view: mat4x4<f32>,
    projection: mat4x4<f32>,
};

struct Sphere {
    position: vec3f,
    radius: f32,  
    velocity: vec3f,
    mass: f32,
}; 

struct Plane {
    normal: vec3f, 
    origin: vec3f, 
} 

struct BackgroundPlane {
    background_plane_normal: vec4f, 
    background_plane_origin: vec4f, 
} 

// will also have normal (-1) * camera face, and origin 2 * unit vector away

struct Stats {
    total_rays: atomic<u32>,
    successful_rays: atomic<u32>,
    chain_iterations: atomic<u32>,
}

struct Ray {
    origin: vec3f, 
    direction: vec3f, 
} 

struct Scene {
    left_eye: vec4f,
    right_eye: vec4f,
    rotated_left_eye: vec4f,
    rotated_right_eye: vec4f,
    sphere_count: u32,
    spheres: array<Sphere>,
}

struct SplatPoint {
    uv: vec2f,
    seed_id: u32,
}

struct SplatBuffer {
    count: atomic<u32>,
    points: array<SplatPoint>,
}

fn write_splat(uv: vec2f, seed_id: u32) {
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return; }
    
    let idx = atomicAdd(&splats.count, 1u);

    splats.points[idx] = SplatPoint(uv, seed_id);
}

// transformations

fn uv_to_world(uv: vec2f) -> vec3f {

    // 0.0->1.0 : 0.0-> dim : -dim/2 -> dim/2
    let vertex_pos = vec2f(
        (uv.x * uniforms.dimensions.x) - uniforms.dimensions.x / 2.0,
        (uv.y * uniforms.dimensions.y) - uniforms.dimensions.y / 2.0
    );

    // -dim/2 -> dim/2 : world space
    let world_pos = matrixUniforms.model * vec4f(vertex_pos, 0.0, 1.0);

    return world_pos.xyz;
}

fn world_to_uv(world_pos: vec3f) -> vec2f {

    // world space : -dim/2 -> dim/2
    let vertex_pos = matrixUniforms.inverse_model * vec4f(world_pos, 1.0);

    // -dim/2 -> dim/2 : 0.0->1.0
    let uv = vec2f(
        (vertex_pos.x + uniforms.dimensions.x / 2.0) / uniforms.dimensions.x,
        (vertex_pos.y + uniforms.dimensions.y / 2.0) / uniforms.dimensions.y
    );

    return uv;
}

fn get_rect_intersect(world_pos: vec3f, eye_pos: vec3f) -> vec2f {
    let dir = normalize(world_pos - eye_pos);
    
    let local_normal = vec4f(0.0, 0.0, 1.0, 0.0);
    let world_normal = normalize((matrixUniforms.model * local_normal).xyz);
    
    // rectangle's center in world space
    let rect_origin = (matrixUniforms.model * vec4f(0.0, 0.0, 0.0, 1.0)).xyz;

    // plane intersection
    let denom = dot(world_normal, dir);
    if (abs(denom) < 0.0001) { return vec2f(-999.0); }  // parallel to plane
    
    let t = dot(rect_origin - eye_pos, world_normal) / denom;
    if (t < 0.0) { return vec2f(-999.0); }  // behind eye
    
    let intersection = eye_pos + dir * t;
    
    let uv = world_to_uv(intersection);
    return uv;
}

fn get_background_plane() -> Plane {
    return Plane(
        backgroundPlane.background_plane_normal.xyz,
        backgroundPlane.background_plane_origin.xyz
    );
}

// geometry handling

fn intersect_sphere(ray: Ray, sphere: Sphere) -> f32 {

    let oc = sphere.position - ray.origin;
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
    
    // check all spheres
    for (var i = 0u; i < scene.sphere_count; i++) {
        let t = intersect_sphere(ray, scene.spheres[i]);
        if (t > 0.0 && t < min_t) {
            min_t = t;
            hit = true;
        }
    }

    // need to generalise to moveable rectangle ^^^^ 
    // thinking that the local normal would just the forward facing camera normal but * (-1)
    // and think about how the model matrix translates / rotates the window infront of the camera
    // the rotation will be the difference between some basis vector and where the yaw pitch etc is looking
    // the translation will have to be some fixed (distance-origin) * the unit camera front vector 
    
    
    // check background plane 
    let background_plane = get_background_plane();
    let plane_t = intersect_plane(ray, background_plane);
    if (plane_t > 0.0 && plane_t < min_t) { min_t = plane_t; hit = true; }
    
    if (!hit) { return -1.0; }
    return min_t;
}

fn chain_direction(start_uv: vec2f, seed_id: u32, from_eye: vec3f, to_eye: vec3f) {
    var current_uv = start_uv;
    
    for (var iter = 0u; iter < 50u; iter++) {
        atomicAdd(&stats.chain_iterations, 1u);
        atomicAdd(&stats.total_rays, 2u); // 2 rays per iteration
        
        let world_pos = uv_to_world(current_uv);
        let ray = Ray(from_eye, normalize(world_pos - from_eye));
        
        let t = trace_scene(ray);
        if (t < 0.0) { break; }
        
        let scene_hit_pos = ray.origin + ray.direction * t;
        
        let verify_ray = Ray(to_eye, normalize(scene_hit_pos - to_eye));
        let verify_t = trace_scene(verify_ray);
        
        if (verify_t < 0.0) { break; }
        
        let verify_pos = verify_ray.origin + verify_ray.direction * verify_t;
        if (distance(scene_hit_pos, verify_pos) > 0.01) { break; }
        
        let next_uv = get_rect_intersect(scene_hit_pos, to_eye);
        if (next_uv.x < 0.0 || next_uv.x > 1.0 || next_uv.y < 0.0 || next_uv.y > 1.0) { break; }
        
        write_splat(next_uv, seed_id);
        current_uv = next_uv;
    }
}



@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<uniform> matrixUniforms: MatrixUniforms;
@group(0) @binding(2) var<storage, read> scene: Scene;
@group(0) @binding(3) var<storage, read_write> splats: SplatBuffer;
@group(0) @binding(4) var<storage, read_write> stats: Stats;
@group(0) @binding(5) var<uniform> backgroundPlane: BackgroundPlane;


@compute @workgroup_size(64) 
fn cs(@builtin(global_invocation_id) id: vec3u) {
    let seed_id = id.x;
    if (seed_id >= u32(uniforms.seedCount)) { return; }

    let delta = 1 / f32(uniforms.seedCount);

    var seed_uv = vec2f(
        hash1(f32(seed_id+0)),
        hash1(f32(seed_id+0) + 100.0)
    );

    // controlled sampling, introduces the occlusion problem tho
    //seed_uv.y = delta * f32(id.x);
    //seed_uv.y = delta * f32(id.x) + hash1(f32(seed_id) + 200.0) * delta * 0.5;
    //seed_uv.x = 0.125;

    
    let world_pos = uv_to_world(seed_uv);
    let left_ray = Ray(scene.left_eye.xyz, normalize(world_pos - scene.left_eye.xyz));
    let t = trace_scene(left_ray);
    
    atomicAdd(&stats.total_rays, 1u); // count initial ray
    
    if (t < 0.0) { return; }
    
    atomicAdd(&stats.successful_rays, 1u);
    
    let scene_hit = left_ray.origin + left_ray.direction * t;
    
    let right_ray = Ray(scene.right_eye.xyz, normalize(scene_hit - scene.right_eye.xyz));
    let right_t = trace_scene(right_ray);
    
    atomicAdd(&stats.total_rays, 1u); // count verification ray
    
    if (right_t < 0.0) { return; }
    
    let right_verify = right_ray.origin + right_ray.direction * right_t;
    if (distance(scene_hit, right_verify) > 0.01) { return; }
    
    let right_uv = get_rect_intersect(scene_hit, scene.right_eye.xyz);

    write_splat(seed_uv, seed_id);
    write_splat(right_uv, seed_id);
    
    chain_direction(right_uv, seed_id, scene.right_eye.xyz, scene.left_eye.xyz); // from right to left
    chain_direction(seed_uv, seed_id, scene.left_eye.xyz, scene.right_eye.xyz);
}
/*
@compute @workgroup_size(64) 
fn cs(@builtin(global_invocation_id) id: vec3u) {
    let seed_id = id.x;
    if (seed_id >= u32(uniforms.seedCount)) { return; }
    
    // Triangular lattice arrangement
    let ipd = 0.065; // Use your actual IPD value
    let row_height = ipd * sqrt(3.0 / 4.0) * 0.4; // ≈ 0.0563
    
    let row = u32((f32(seed_id) / 8.0)); // Assuming 16 seeds per row
    let col = seed_id % 8u;
    
    // Offset every other row by half IPD for triangular packing
    let x_offset = select(0.0, ipd * 0.5, row % 2u == 1u);
    
    var seed_uv = vec2f(
        hash1(f32(seed_id+0)),
        hash1(f32(seed_id+0) + 100.0)
    );
    
    // Normalize to UV space
    seed_uv.x = fract(seed_uv.x); // Wrap horizontally if needed
    
    let world_pos = uv_to_world(seed_uv);
    
    // Now trace with BOTH baselines
    // Cast from LEFT eye
    let left_ray = Ray(scene.left_eye.xyz, normalize(world_pos - scene.left_eye.xyz));
    let t = trace_scene(left_ray);
    
    if (t < 0.0) { return; }
    
    let scene_hit = left_ray.origin + left_ray.direction * t;
    
    // Verify BOTH eyes see it
    let right_ray = Ray(scene.right_eye.xyz, normalize(scene_hit - scene.right_eye.xyz));
    let right_t = trace_scene(right_ray);
    
    let top_ray = Ray(scene.rotated_left_eye.xyz, normalize(scene_hit - scene.rotated_left_eye.xyz));
    let top_t = trace_scene(top_ray);
    
    if (right_t < 0.0 || top_t < 0.0) { return; }
    
    let right_verify = right_ray.origin + right_ray.direction * right_t;
    let top_verify = top_ray.origin + top_ray.direction * top_t;
    
    if (distance(scene_hit, right_verify) > 0.01 || 
        distance(scene_hit, top_verify) > 0.01) { return; }
    
    let right_uv = get_rect_intersect(scene_hit, scene.right_eye.xyz);
    let top_uv = get_rect_intersect(scene_hit, scene.rotated_left_eye.xyz);
    
    // Write with SAME seed_id
    write_splat(seed_uv, seed_id);
    write_splat(right_uv, seed_id);
    write_splat(top_uv, seed_id);
    
    // Chain along BOTH baselines
    chain_direction(right_uv, seed_id, scene.right_eye.xyz, scene.left_eye.xyz);
    chain_direction(seed_uv, seed_id, scene.left_eye.xyz, scene.right_eye.xyz);
    
    chain_direction(top_uv, seed_id, scene.rotated_left_eye.xyz, scene.left_eye.xyz);
    chain_direction(seed_uv, seed_id, scene.left_eye.xyz, scene.rotated_left_eye.xyz);

    //chain_direction(top_uv, seed_id, scene.rotated_left_eye.xyz, scene.right_eye.xyz);
    //chain_direction(right_uv, seed_id, scene.right_eye.xyz, scene.rotated_left_eye.xyz);
}*/

/*
@compute @workgroup_size(64) 
fn cs(@builtin(global_invocation_id) id: vec3u) {

    let uniforms.seedCount: u32 = u32(uniforms.seedCount);

    let seed_id = id.x;
    if (seed_id >= uniforms.seedCount) { return; }

    var seed_uv = vec2f(
        hash1(f32(seed_id+0)),
        hash1(f32(seed_id+0) + 1000.0)
    );
    
    let world_pos = uv_to_world(seed_uv);

    // Cast from left eye to find a 3D point
    let left_ray = Ray(scene.left_eye.xyz, normalize(world_pos - scene.left_eye.xyz));
    let t = trace_scene(left_ray);
    
    atomicAdd(&stats.total_rays, 1u);
    
    if (t < 0.0) { return; }
    
    atomicAdd(&stats.successful_rays, 1u);
    
    let scene_hit = left_ray.origin + left_ray.direction * t;
    
    // Verify ALL FOUR eyes see the SAME 3D point
    let right_ray = Ray(scene.right_eye.xyz, normalize(scene_hit - scene.right_eye.xyz));
    let right_t = trace_scene(right_ray);
    
    let rotated_left_ray = Ray(scene.rotated_left_eye.xyz, normalize(scene_hit - scene.rotated_left_eye.xyz));
    let rotated_left_t = trace_scene(rotated_left_ray);
    
    let rotated_right_ray = Ray(scene.rotated_right_eye.xyz, normalize(scene_hit - scene.rotated_right_eye.xyz));
    let rotated_right_t = trace_scene(rotated_right_ray);
    
    atomicAdd(&stats.total_rays, 3u);
    
    // If any eye can't see the point, skip this seed
    if (right_t < 0.0 || rotated_left_t < 0.0 || rotated_right_t < 0.0) { return; }
    
    // Verify all rays converge to the SAME 3D point (within tolerance)
    let right_verify = right_ray.origin + right_ray.direction * right_t;
    let rotated_left_verify = rotated_left_ray.origin + rotated_left_ray.direction * rotated_left_t;
    let rotated_right_verify = rotated_right_ray.origin + rotated_right_ray.direction * rotated_right_t;
    
    if (distance(scene_hit, right_verify) > 0.01 || 
        distance(scene_hit, rotated_left_verify) > 0.01 ||
        distance(scene_hit, rotated_right_verify) > 0.01) { 
        return; 
    }
    
    // All eyes agree on the same 3D point! Calculate UV positions for each view
    let right_uv = get_rect_intersect(scene_hit, scene.right_eye.xyz);
    let rotated_left_uv = get_rect_intersect(scene_hit, scene.rotated_left_eye.xyz);
    let rotated_right_uv = get_rect_intersect(scene_hit, scene.rotated_right_eye.xyz);
    
    // Write splats with SAME seed_id for stereopsis consistency
    write_splat(seed_uv, seed_id);
    write_splat(right_uv, seed_id);
    write_splat(rotated_left_uv, seed_id);
    write_splat(rotated_right_uv, seed_id);
    
    // Chain along BOTH baselines to fill in epipolar lines
    // Horizontal baseline
    chain_direction(right_uv, seed_id, scene.right_eye.xyz, scene.left_eye.xyz);
    chain_direction(seed_uv, seed_id, scene.left_eye.xyz, scene.right_eye.xyz);
    
    // Rotated baseline
    chain_direction(rotated_right_uv, seed_id, scene.rotated_right_eye.xyz, scene.rotated_left_eye.xyz);
    chain_direction(rotated_left_uv, seed_id, scene.rotated_left_eye.xyz, scene.rotated_right_eye.xyz);
} */


fn hash1(p: f32) -> f32 { // yoinked a better hash function from somewhere 
    var p_mut = fract(p * 0.1031);
    p_mut *= p_mut + 33.33;
    p_mut *= p_mut + p_mut;
    return fract(p_mut);
}
