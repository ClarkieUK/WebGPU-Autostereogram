struct Sphere {
    position: vec3f,
    radius: f32,  
    velocity: vec3f,
    mass: f32,
}

struct Scene {
    left_eye: vec4f,
    right_eye: vec4f,
    rotated_left_eye: vec4f,
    rotated_right_eye: vec4f,
    sphere_count: u32,
    spheres: array<Sphere>,
}

struct Params {
    dt: f32,
    G: f32,
}

struct RKResult {
    position: vec3f,
    velocity: vec3f,
}

@group(0) @binding(0) var<storage, read_write> scene: Scene;
@group(0) @binding(1) var<uniform> params: Params;

var<workgroup> shared_accel: array<vec3f, 64>;

fn compute_acceleration(pos_i: vec3f, pos_j: vec3f, mass_j: f32) -> vec3f {
    let dr = pos_j - pos_i;
    let dist_sq = dot(dr, dr) + 1e-4;
    let dist = sqrt(dist_sq);
    return params.G * mass_j * dr / (dist * dist * dist); 
}

fn compute_total_accel(this_body: u32, tid: u32, test_pos: vec3f) -> vec3f {
    var accel = vec3f(0.0);
    for (var j = tid; j < scene.sphere_count; j += 64u) {
        if (j != this_body) { // self interaction check btw
            accel += compute_acceleration(test_pos, scene.spheres[j].position, scene.spheres[j].mass);
        }
    }
    
    shared_accel[tid] = accel; 

    // this function is really quite dense in logic, 
    // thread say tid = 15 maps to body 15 , 79 , 143 ... < 1000
    // each of these bodies has their acceleration accumulated into the shared memory space at 
    // shared[tid] then we have to wait for all of the threads to finish, then we can collapse the shared 
    // acceleration into a singular acceleration on i value. This will be happening PER workgroup.

    workgroupBarrier();
    
    for (var s = 32u; s > 0u; s >>= 1u) { // this is just a bitwise shift, same as dividing by 2
        if (tid < s) {
            shared_accel[tid] += shared_accel[tid + s];
        }
        workgroupBarrier();
    }
    
    return shared_accel[0]; // all of the thread seeds 15, 54, 62 have been absorbed into thread id 0 
}

fn dormand_prince8(this_body: u32, tid: u32, dt: f32, r0: vec3f, v0: vec3f) -> RKResult {
    
    // k1
    let drs1 = v0 * dt;
    let dvs1 = compute_total_accel(this_body, tid, r0) * dt;
    
    // k2
    let r2 = r0 + (1.0/5.0) * drs1;
    let v2 = v0 + (1.0/5.0) * dvs1;
    let drs2 = v2 * dt;
    let dvs2 = compute_total_accel(this_body, tid, r2) * dt;
    
    // k3
    let r3 = r0 + (3.0/40.0) * drs1 + (9.0/40.0) * drs2;
    let v3 = v0 + (3.0/40.0) * dvs1 + (9.0/40.0) * dvs2;
    let drs3 = v3 * dt;
    let dvs3 = compute_total_accel(this_body, tid, r3) * dt;
    
    // k4
    let r4 = r0 + (44.0/45.0) * drs1 + (-56.0/15.0) * drs2 + (32.0/9.0) * drs3;
    let v4 = v0 + (44.0/45.0) * dvs1 + (-56.0/15.0) * dvs2 + (32.0/9.0) * dvs3;
    let drs4 = v4 * dt;
    let dvs4 = compute_total_accel(this_body, tid, r4) * dt;
    
    // k5
    let r5 = r0 + (19372.0/6561.0) * drs1 + (-25360.0/2187.0) * drs2 + 
                  (64448.0/6561.0) * drs3 + (-212.0/729.0) * drs4;
    let v5 = v0 + (19372.0/6561.0) * dvs1 + (-25360.0/2187.0) * dvs2 + 
                  (64448.0/6561.0) * dvs3 + (-212.0/729.0) * dvs4;
    let drs5 = v5 * dt;
    let dvs5 = compute_total_accel(this_body, tid, r5) * dt;
    
    // k6
    let r6 = r0 + (9017.0/3168.0) * drs1 + (-355.0/33.0) * drs2 + 
                  (46732.0/5247.0) * drs3 + (49.0/176.0) * drs4 + 
                  (-5103.0/18656.0) * drs5;
    let v6 = v0 + (9017.0/3168.0) * dvs1 + (-355.0/33.0) * dvs2 + 
                  (46732.0/5247.0) * dvs3 + (49.0/176.0) * dvs4 + 
                  (-5103.0/18656.0) * dvs5;
    let drs6 = v6 * dt;
    let dvs6 = compute_total_accel(this_body, tid, r6) * dt;
    
    let drs5_order = (35.0/384.0) * drs1 + (500.0/1113.0) * drs3 - 
                     (125.0/192.0) * drs4 + (-2187.0/6784.0) * drs5 + (11.0/84.0) * drs6;
    let dvs5_order = (35.0/384.0) * dvs1 + (500.0/1113.0) * dvs3 - 
                     (125.0/192.0) * dvs4 + (-2187.0/6784.0) * dvs5 + (11.0/84.0) * dvs6;
    
    var result: RKResult;
    result.position = r0 + drs5_order;
    result.velocity = v0 + dvs5_order;
    return result;
}

@compute @workgroup_size(64) 
fn cs(@builtin(workgroup_id) wg_id: vec3u, @builtin(local_invocation_id) local_id: vec3u) {
    let this_body = wg_id.x;
    let tid = local_id.x;
    
    let r0 = scene.spheres[this_body].position;
    let v0 = scene.spheres[this_body].velocity;
    let dt = params.dt;

    //let total_accel = compute_total_accel(this_body, tid, r0);
    let result = dormand_prince8(this_body, tid, dt, r0, v0);

    if (tid == 0u) {
        scene.spheres[this_body].position = result.position;
        scene.spheres[this_body].velocity = result.velocity;
    }
}