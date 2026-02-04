import{vec3 as a,mat4 as M}from"https://wgpu-matrix.org/dist/3.x/wgpu-matrix.module.js";import we from"https://muigui.org/dist/0.x/muigui.module.js";(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const s of document.querySelectorAll('link[rel="modulepreload"]'))r(s);new MutationObserver(s=>{for(const n of s)if(n.type==="childList")for(const c of n.addedNodes)c.tagName==="LINK"&&c.rel==="modulepreload"&&r(c)}).observe(document,{childList:!0,subtree:!0});function t(s){const n={};return s.integrity&&(n.integrity=s.integrity),s.referrerPolicy&&(n.referrerPolicy=s.referrerPolicy),s.crossOrigin==="use-credentials"?n.credentials="include":s.crossOrigin==="anonymous"?n.credentials="omit":n.credentials="same-origin",n}function r(s){if(s.ep)return;s.ep=!0;const n=t(s);fetch(s.href,n)}})();const Pe=`struct Uniforms {\r
    resolution: vec2f,\r
    dimensions: vec2f,\r
    noiseCount: f32,\r
};\r
\r
struct MatrixUniforms {\r
    model: mat4x4<f32>,\r
    inverse_model: mat4x4<f32>,\r
    view: mat4x4<f32>,\r
    projection: mat4x4<f32>,\r
};\r
\r
struct SplatPoint {\r
    uv: vec2f,\r
    seed_id: u32,\r
}\r
\r
struct SplatBuffer {\r
    count: atomic<u32>,\r
    points: array<SplatPoint>,\r
}\r
\r
@group(0) @binding(0) var<uniform> uniforms: Uniforms;\r
@group(0) @binding(1) var<storage, read_write> splats: SplatBuffer; // from compute shader\r
@group(0) @binding(2) var<uniform> matrixUniforms: MatrixUniforms;\r
\r
struct Vertex {\r
    @location(0) position: vec2f,\r
    @location(1) texCoord: vec2f,\r
}\r
\r
struct ourVsOutput {\r
    @builtin(position) position: vec4f,\r
    @location(0) texCoord: vec2f,\r
}\r
/*\r
@vertex fn vs(vert: Vertex) -> ourVsOutput {\r
\r
    // gl_Position = projection * view * model * vec4(aPos.x,aPos.y,aPos.z, 1.0);\r
    // reminding myself of c++ / opengl implementation\r
\r
    let worldPosition = matrixUniforms.model * vec4f(vert.position, 0.0, 1.0);\r
    \r
    let clipX = worldPosition.x / (uniforms.resolution.x / uniforms.resolution.y);\r
    let clipY = worldPosition.y;\r
\r
    var output: ourVsOutput;\r
    output.position = vec4f(clipX, clipY, 0.0, 1.0);\r
    output.texCoord = vert.texCoord;\r
    return output;\r
}*/\r
\r
@vertex fn vs(vert: Vertex) -> ourVsOutput {\r
    let worldPos = matrixUniforms.model * vec4f(vert.position, 0.0, 1.0);\r
    \r
    let foo = matrixUniforms.projection * matrixUniforms.view * matrixUniforms.model * vec4f(vert.position, 0.0, 1.0);\r
\r
    // Always project as if monitor is 0.6m * 0.35m\r
    let clipX = worldPos.x / (0.6 / 2);  // (0.6 / 2.0)\r
    let clipY = worldPos.y / (0.35 / 2); // (0.35 / 2.0)\r
    \r
    var output: ourVsOutput;\r
    output.position = foo; //vec4f(clipX, clipY, 0.0, 1.0);\r
    output.texCoord = vert.texCoord;\r
    return output;\r
}\r
/* fun tiliing */ \r
/*\r
@fragment fn fs(fsInput: ourVsOutput) -> @location(0) vec4f {\r
    let num_splats = atomicLoad(&splats.count);\r
    \r
    let vertex_pos = vec2f(\r
        fsInput.texCoord.x * uniforms.dimensions.x - uniforms.dimensions.x / 2.0,\r
        fsInput.texCoord.y * uniforms.dimensions.y - uniforms.dimensions.y / 2.0\r
    );\r
    let frag_world_pos = (matrixUniforms.model * vec4f(vertex_pos, 0.0, 1.0)).xyz;\r
    \r
    // Find two closest splats\r
    var min_dist1 = 999999.0;\r
    var min_dist2 = 999999.0;\r
    var closest_seed_id = 0u;\r
    \r
    for (var i = 0u; i < num_splats; i++) {\r
        let splat = splats.points[i];\r
        \r
        let splat_vertex_pos = vec2f(\r
            splat.uv.x * uniforms.dimensions.x - uniforms.dimensions.x / 2.0,\r
            splat.uv.y * uniforms.dimensions.y - uniforms.dimensions.y / 2.0\r
        );\r
        let splat_world_pos = (matrixUniforms.model * vec4f(splat_vertex_pos, 0.0, 1.0)).xyz;\r
        \r
        let dist = distance(frag_world_pos, splat_world_pos);\r
        \r
        if (dist < min_dist1) {\r
            min_dist2 = min_dist1;\r
            min_dist1 = dist;\r
            closest_seed_id = splat.seed_id;\r
        } else if (dist < min_dist2) {\r
            min_dist2 = dist;\r
        }\r
    }\r
    \r
    let seed_color = hash3(f32(closest_seed_id));\r
    \r
    // Edge detection: if two closest distances are similar, we're near an edge\r
    let edge_threshold = 0.005;  // adjust for edge thickness\r
    let edge_factor = smoothstep(0.0, edge_threshold, min_dist2 - min_dist1);\r
    \r
    // Darken edges\r
    let final_color = seed_color * edge_factor;\r
    \r
    return vec4f(final_color*3, 1.0);\r
}*/\r
\r
/* Classic dots with no culling */ /*\r
@fragment fn fs(fsInput: ourVsOutput) -> @location(0) vec4f {\r
    var color = vec4f(0.0);\r
    \r
    let num_splats = atomicLoad(&splats.count);\r
    \r
    // convert current fragment's UV to world position\r
    let vertex_pos = vec2f(\r
        fsInput.texCoord.x * uniforms.dimensions.x - uniforms.dimensions.x / 2.0,\r
        fsInput.texCoord.y * uniforms.dimensions.y - uniforms.dimensions.y / 2.0\r
    );\r
    let frag_world_pos = (matrixUniforms.model * vec4f(vertex_pos, 0.0, 1.0)).xyz;\r
    \r
    // fixed world-space sigma\r
    let sigma = 0.0023;\r
    \r
    for (var i = 0u; i < num_splats; i++) {\r
        let splat = splats.points[i];\r
        \r
        // convert splat UV to world position\r
        let splat_vertex_pos = vec2f(\r
            splat.uv.x * uniforms.dimensions.x - uniforms.dimensions.x / 2.0,\r
            splat.uv.y * uniforms.dimensions.y - uniforms.dimensions.y / 2.0\r
        );\r
        let splat_world_pos = (matrixUniforms.model * vec4f(splat_vertex_pos, 0.0, 1.0)).xyz;\r
        \r
        // distance in world space\r
        let dist = distance(frag_world_pos, splat_world_pos);\r
        \r
        let weight = exp(-(dist * dist) / (2.0 * sigma * sigma));\r
        \r
        let seed_color = hash3(f32(splat.seed_id));\r
        \r
        color += vec4f(seed_color * weight, weight);\r
    }\r
    \r
    return vec4f(color.rgb, 1.0);\r
}*/\r
\r
// culling version -> \r
\r
@fragment fn fs(fsInput: ourVsOutput) -> @location(0) vec4f {\r
    var color = vec4f(0.0);\r
    \r
    let num_splats = atomicLoad(&splats.count);\r
\r
    //let vertex_pos = vec2f(\r
    //    fsInput.texCoord.x * uniforms.dimensions.x - uniforms.dimensions.x / 2.0,\r
    //    fsInput.texCoord.y * uniforms.dimensions.y - uniforms.dimensions.y / 2.0\r
    //);\r
\r
    let vertex_pos = vec2f(\r
        fsInput.texCoord.x * uniforms.dimensions.x - uniforms.dimensions.x / 2.0,\r
        fsInput.texCoord.y * uniforms.dimensions.y - uniforms.dimensions.y / 2.0\r
    );\r
\r
    let frag_world_pos = (matrixUniforms.model * vec4f(vertex_pos, 0.0, 1.0)).xyz;\r
    \r
    let sigma = 0.0023;\r
    let two_sigma_sq = 2.0 * sigma * sigma; \r
    \r
    let cutoff_distance = 3.0 * sigma; \r
    let cutoff_distance_sq = cutoff_distance * cutoff_distance;\r
    \r
    var contributions = 0u; \r
    \r
    for (var i = 0u; i < num_splats; i++) {\r
        let splat = splats.points[i];\r
        \r
        let splat_vertex_pos = vec2f(\r
            splat.uv.x * uniforms.dimensions.x - uniforms.dimensions.x / 2.0,\r
            splat.uv.y * uniforms.dimensions.y - uniforms.dimensions.y / 2.0\r
        );\r
        let splat_world_pos = (matrixUniforms.model * vec4f(splat_vertex_pos, 0.0, 1.0)).xyz;\r
        \r
        let diff = frag_world_pos - splat_world_pos;\r
        let dist_sq = dot(diff, diff);\r
        \r
        if (dist_sq > cutoff_distance_sq) { \r
            continue; \r
        }\r
        \r
        contributions++;\r
        \r
        let weight = exp(-dist_sq / two_sigma_sq);\r
        \r
        let seed_color = hash3(f32(splat.seed_id));\r
        \r
        color += vec4f(seed_color * weight, weight);\r
    }\r
\r
    let noise_count = u32(uniforms.noiseCount);\r
    for (var n = 0u; n < noise_count; n++) {\r
        // Use different primes and offsets to decorrelate x and y\r
        let noise_seed = f32(n);\r
        let random_x = hash1(noise_seed * 73.12 + 15.789) * uniforms.dimensions.x - uniforms.dimensions.x / 2.0;\r
        let random_y = hash1(noise_seed * 139.71 + 283.456) * uniforms.dimensions.y - uniforms.dimensions.y / 2.0;\r
        \r
        let noise_vertex_pos = vec2f(random_x, random_y);\r
        let noise_world_pos = (matrixUniforms.model * vec4f(noise_vertex_pos, 0.0, 1.0)).xyz;\r
        \r
        let diff = frag_world_pos - noise_world_pos;\r
        let dist_sq = dot(diff, diff);\r
        \r
        if (dist_sq <= cutoff_distance_sq) {\r
            let weight = exp(-dist_sq / two_sigma_sq);\r
            let noise_color = hash3(noise_seed * 197.3 + 412.89);\r
            color += vec4f(noise_color * weight, weight);\r
        }\r
    }\r
    \r
    return vec4f(color.rgb, 1.0);\r
}\r
\r
\r
fn hash1(p: f32) -> f32 {\r
    return fract(sin(p) * 43758.5453123);\r
}\r
\r
fn hash3(p: f32) -> vec3f {\r
    return vec3f(\r
        hash1(p + 1.0),\r
        hash1(p + 2.0),\r
        hash1(p + 3.0)\r
    );\r
}`,Be=`struct Uniforms {\r
    resolution: vec2f,\r
    dimensions: vec2f,\r
};\r
\r
struct MatrixUniforms {\r
    model: mat4x4<f32>,\r
    inverse_model: mat4x4<f32>,\r
    view: mat4x4<f32>,\r
    projection: mat4x4<f32>,\r
};\r
\r
struct Sphere {\r
    position: vec3f,\r
    radius: f32,  \r
    velocity: vec3f,\r
    mass: f32,\r
}; \r
\r
struct Plane {\r
    normal: vec3f, \r
    origin: vec3f, \r
} \r
\r
struct BackgroundPlane {\r
    background_plane_normal: vec4f, \r
    background_plane_origin: vec4f, \r
} \r
\r
// will also have normal (-1) * camera face, and origin 2 * unit vector away\r
\r
struct Stats {\r
    total_rays: atomic<u32>,\r
    successful_rays: atomic<u32>,\r
    chain_iterations: atomic<u32>,\r
}\r
\r
struct Ray {\r
    origin: vec3f, \r
    direction: vec3f, \r
} \r
\r
struct Scene {\r
    left_eye: vec4f,\r
    right_eye: vec4f,\r
    sphere_count: u32,\r
    spheres: array<Sphere>,\r
}\r
\r
struct SplatPoint {\r
    uv: vec2f,\r
    seed_id: u32,\r
}\r
\r
struct SplatBuffer {\r
    count: atomic<u32>,\r
    points: array<SplatPoint>,\r
}\r
\r
fn write_splat(uv: vec2f, seed_id: u32) {\r
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return; }\r
    \r
    let idx = atomicAdd(&splats.count, 1u);\r
\r
    splats.points[idx] = SplatPoint(uv, seed_id);\r
}\r
\r
// transformations\r
\r
fn uv_to_world(uv: vec2f) -> vec3f {\r
\r
    // 0.0->1.0 : 0.0-> dim : -dim/2 -> dim/2\r
    let vertex_pos = vec2f(\r
        (uv.x * uniforms.dimensions.x) - uniforms.dimensions.x / 2.0,\r
        (uv.y * uniforms.dimensions.y) - uniforms.dimensions.y / 2.0\r
    );\r
\r
    // -dim/2 -> dim/2 : world space\r
    let world_pos = matrixUniforms.model * vec4f(vertex_pos, 0.0, 1.0);\r
\r
    return world_pos.xyz;\r
}\r
\r
fn world_to_uv(world_pos: vec3f) -> vec2f {\r
\r
    // world space : -dim/2 -> dim/2\r
    let vertex_pos = matrixUniforms.inverse_model * vec4f(world_pos, 1.0);\r
\r
    // -dim/2 -> dim/2 : 0.0->1.0\r
    let uv = vec2f(\r
        (vertex_pos.x + uniforms.dimensions.x / 2.0) / uniforms.dimensions.x,\r
        (vertex_pos.y + uniforms.dimensions.y / 2.0) / uniforms.dimensions.y\r
    );\r
\r
    return uv;\r
}\r
\r
fn get_rect_intersect(world_pos: vec3f, eye_pos: vec3f) -> vec2f {\r
    let dir = normalize(world_pos - eye_pos);\r
    \r
    let local_normal = vec4f(0.0, 0.0, 1.0, 0.0);\r
    let world_normal = normalize((matrixUniforms.model * local_normal).xyz);\r
    \r
    // rectangle's center in world space\r
    let rect_origin = (matrixUniforms.model * vec4f(0.0, 0.0, 0.0, 1.0)).xyz;\r
\r
    // plane intersection\r
    let denom = dot(world_normal, dir);\r
    if (abs(denom) < 0.0001) { return vec2f(-999.0); }  // parallel to plane\r
    \r
    let t = dot(rect_origin - eye_pos, world_normal) / denom;\r
    if (t < 0.0) { return vec2f(-999.0); }  // behind eye\r
    \r
    let intersection = eye_pos + dir * t;\r
    \r
    let uv = world_to_uv(intersection);\r
    return uv;\r
}\r
\r
fn get_background_plane() -> Plane {\r
    return Plane(\r
        backgroundPlane.background_plane_normal.xyz,\r
        backgroundPlane.background_plane_origin.xyz\r
    );\r
}\r
\r
// geometry handling\r
\r
fn intersect_sphere(ray: Ray, sphere: Sphere) -> f32 {\r
\r
    let oc = sphere.position - ray.origin;\r
    let a = dot(ray.direction, ray.direction);\r
    let b = -2.0 * dot(oc, ray.direction);\r
    let c = dot(oc, oc) - sphere.radius * sphere.radius;\r
    let discriminant = b*b - 4.0*a*c;\r
    \r
    if (discriminant < 0.0) { return -1.0; } // no hit\r
    \r
    // return smallest t, t1 < t2\r
    let t1 = (-b - sqrt(discriminant)) / (2.0*a);\r
    let t2 = (-b + sqrt(discriminant)) / (2.0*a);\r
    \r
    if (t1 > 0.0) { return t1; }\r
    if (t2 > 0.0) { return t2; }\r
    return -1.0;\r
}\r
\r
fn intersect_plane(ray: Ray, plane: Plane) -> f32 {\r
    let denom = dot(plane.normal, ray.direction);\r
    if (abs(denom) < 0.0001) { return -1.0; }\r
    \r
    let t = dot(plane.origin - ray.origin, plane.normal) / denom;\r
    if (t < 0.0) { return -1.0; }\r
    return t;\r
}\r
\r
fn trace_scene(ray: Ray) -> f32 {\r
    var min_t = 999999.0;\r
    var hit = false;\r
    \r
    // check all spheres\r
    for (var i = 0u; i < scene.sphere_count; i++) {\r
        let t = intersect_sphere(ray, scene.spheres[i]);\r
        if (t > 0.0 && t < min_t) {\r
            min_t = t;\r
            hit = true;\r
        }\r
    }\r
\r
    // need to generalise to moveable rectangle ^^^^ \r
    // thinking that the local normal would just the forward facing camera normal but * (-1)\r
    // and think about how the model matrix translates / rotates the window infront of the camera\r
    // the rotation will be the difference between some basis vector and where the yaw pitch etc is looking\r
    // the translation will have to be some fixed (distance-origin) * the unit camera front vector \r
    \r
    \r
    // check background plane \r
    let background_plane = get_background_plane();\r
    let plane_t = intersect_plane(ray, background_plane);\r
    if (plane_t > 0.0 && plane_t < min_t) { min_t = plane_t; hit = true; }\r
    \r
    if (!hit) { return -1.0; }\r
    return min_t;\r
}\r
\r
fn chain_direction(start_uv: vec2f, seed_id: u32, from_eye: vec3f, to_eye: vec3f) {\r
    var current_uv = start_uv;\r
    \r
    for (var iter = 0u; iter < 25u; iter++) {\r
        atomicAdd(&stats.chain_iterations, 1u);\r
        atomicAdd(&stats.total_rays, 2u); // 2 rays per iteration\r
        \r
        let world_pos = uv_to_world(current_uv);\r
        let ray = Ray(from_eye, normalize(world_pos - from_eye));\r
        \r
        let t = trace_scene(ray);\r
        if (t < 0.0) { break; }\r
        \r
        let scene_hit_pos = ray.origin + ray.direction * t;\r
        \r
        let verify_ray = Ray(to_eye, normalize(scene_hit_pos - to_eye));\r
        let verify_t = trace_scene(verify_ray);\r
        \r
        if (verify_t < 0.0) { break; }\r
        \r
        let verify_pos = verify_ray.origin + verify_ray.direction * verify_t;\r
        if (distance(scene_hit_pos, verify_pos) > 0.01) { break; }\r
        \r
        let next_uv = get_rect_intersect(scene_hit_pos, to_eye);\r
        if (next_uv.x < 0.0 || next_uv.x > 1.0 || next_uv.y < 0.0 || next_uv.y > 1.0) { break; }\r
        \r
        write_splat(next_uv, seed_id);\r
        current_uv = next_uv;\r
    }\r
}\r
\r
@group(0) @binding(0) var<uniform> uniforms: Uniforms;\r
@group(0) @binding(1) var<uniform> matrixUniforms: MatrixUniforms;\r
@group(0) @binding(2) var<storage, read> scene: Scene;\r
@group(0) @binding(3) var<storage, read_write> splats: SplatBuffer;\r
@group(0) @binding(4) var<storage, read_write> stats: Stats;\r
@group(0) @binding(5) var<uniform> backgroundPlane: BackgroundPlane;\r
\r
const NUM_SEEDS: u32 = 5 * 64u;\r
\r
@compute @workgroup_size(64) \r
fn cs(@builtin(global_invocation_id) id: vec3u) {\r
    let seed_id = id.x;\r
    if (seed_id >= NUM_SEEDS) { return; }\r
\r
    let delta = 1 / f32(NUM_SEEDS);\r
\r
    var seed_uv = vec2f(\r
        hash1(f32(seed_id+0)),\r
        hash1(f32(seed_id+0) + 100.0)\r
    );\r
\r
    seed_uv.y = delta * f32(id.x);\r
    //seed_uv.x = 0.125;\r
\r
    \r
    let world_pos = uv_to_world(seed_uv);\r
    let left_ray = Ray(scene.left_eye.xyz, normalize(world_pos - scene.left_eye.xyz));\r
    let t = trace_scene(left_ray);\r
    \r
    atomicAdd(&stats.total_rays, 1u); // count initial ray\r
    \r
    if (t < 0.0) { return; }\r
    \r
    atomicAdd(&stats.successful_rays, 1u);\r
    \r
    let scene_hit = left_ray.origin + left_ray.direction * t;\r
    \r
    let right_ray = Ray(scene.right_eye.xyz, normalize(scene_hit - scene.right_eye.xyz));\r
    let right_t = trace_scene(right_ray);\r
    \r
    atomicAdd(&stats.total_rays, 1u); // count verification ray\r
    \r
    if (right_t < 0.0) { return; }\r
    \r
    let right_verify = right_ray.origin + right_ray.direction * right_t;\r
    if (distance(scene_hit, right_verify) > 0.01) { return; }\r
    \r
    let right_uv = get_rect_intersect(scene_hit, scene.right_eye.xyz);\r
\r
    write_splat(seed_uv, seed_id);\r
    write_splat(right_uv, seed_id);\r
    \r
    chain_direction(right_uv, seed_id, scene.right_eye.xyz, scene.left_eye.xyz); // from right to left\r
    chain_direction(seed_uv, seed_id, scene.left_eye.xyz, scene.right_eye.xyz);\r
}\r
\r
fn hash1(p: f32) -> f32 { // yoinked a better hash function from somewhere \r
    var p_mut = fract(p * 0.1031);\r
    p_mut *= p_mut + 33.33;\r
    p_mut *= p_mut + p_mut;\r
    return fract(p_mut);\r
}\r
`,Se=`struct MatrixUniforms {\r
    model: mat4x4f,\r
    inverseModel: mat4x4f,\r
    view: mat4x4f,\r
    projection: mat4x4f,\r
}\r
\r
struct Sphere {\r
    position: vec3f,\r
    radius: f32,  \r
    velocity: vec3f,\r
    mass: f32,\r
}; \r
\r
struct Scene {\r
    left_eye: vec4f,\r
    right_eye: vec4f,\r
    sphere_count: u32,\r
    spheres: array<Sphere>, \r
}\r
\r
@group(0) @binding(0) var<uniform> matrices: MatrixUniforms;\r
@group(0) @binding(1) var<storage, read> scene: Scene;\r
\r
struct VertexInput {\r
    @location(0) position: vec3f,\r
    @location(1) texCoord: vec2f,\r
    @location(2) normal: vec3f,\r
    @builtin(instance_index) instanceIdx: u32,\r
}\r
\r
struct VertexOutput {\r
    @builtin(position) position: vec4f,\r
    @location(0) normal: vec3f,\r
    @location(1) worldPos: vec3f,\r
    @location(2) texCoord: vec2f,\r
    @location(3) absVelocity: f32,\r
}\r
\r
@vertex\r
fn vs(input: VertexInput) -> VertexOutput {\r
    var output: VertexOutput;\r
    \r
    let sphere = scene.spheres[input.instanceIdx];\r
    \r
    let worldPos = input.position * sphere.radius + sphere.position; // effectively the model matrix transform\r
    \r
    output.position = matrices.projection * matrices.view * vec4f(worldPos, 1.0);\r
    \r
    output.normal = normalize(input.normal);\r
    output.worldPos = worldPos;\r
    output.texCoord = input.texCoord;\r
    output.absVelocity = sqrt(dot(sphere.velocity,sphere.velocity));\r
    \r
    return output;\r
}\r
\r
@fragment\r
fn fs(input: VertexOutput) -> @location(0) vec4f {    \r
\r
    let t = clamp(input.absVelocity / 2.0, 0.0, 1.0);\r
    let color = viridis(t);\r
    \r
    return vec4f(color, 1.0);\r
    //return vec4f(0.2);\r
    //return vec4f(input.normal, 1.0);\r
    //return vec4f(input.texCoord, 1.0, 1.0);\r
    //return vec4f(input.worldPos, 1.0);\r
}\r
\r
fn viridis(t: f32) -> vec3f {\r
    let c0 = vec3f(0.267, 0.005, 0.329);\r
    let c1 = vec3f(0.282, 0.514, 0.564);\r
    let c2 = vec3f(0.993, 0.906, 0.144);\r
    \r
    let t2 = t * t;\r
    return mix(mix(c0, c1, t), c2, t2);\r
}`,Ue=`struct Sphere {\r
    position: vec3f,\r
    radius: f32,  \r
    velocity: vec3f,\r
    mass: f32,\r
}\r
\r
struct Scene {\r
    left_eye: vec4f,\r
    right_eye: vec4f,\r
    sphere_count: u32,\r
    spheres: array<Sphere>,\r
}\r
\r
struct Params {\r
    dt: f32,\r
    G: f32,\r
}\r
\r
struct RKResult {\r
    position: vec3f,\r
    velocity: vec3f,\r
}\r
\r
@group(0) @binding(0) var<storage, read_write> scene: Scene;\r
@group(0) @binding(1) var<uniform> params: Params;\r
\r
var<workgroup> shared_accel: array<vec3f, 64>;\r
\r
fn compute_acceleration(pos_i: vec3f, pos_j: vec3f, mass_j: f32) -> vec3f {\r
    let dr = pos_j - pos_i;\r
    let dist_sq = dot(dr, dr) + 1e-6;\r
    let dist = sqrt(dist_sq);\r
    return params.G * mass_j * dr / (dist * dist * dist); \r
}\r
\r
fn compute_total_accel(this_body: u32, tid: u32, test_pos: vec3f) -> vec3f {\r
    var accel = vec3f(0.0);\r
    for (var j = tid; j < scene.sphere_count; j += 64u) {\r
        if (j != this_body) { // self interaction check btw\r
            accel += compute_acceleration(test_pos, scene.spheres[j].position, scene.spheres[j].mass);\r
        }\r
    }\r
    \r
    shared_accel[tid] = accel; \r
\r
    // this function is really quite dense in logic, \r
    // thread say tid = 15 maps to body 15 , 79 , 143 ... < 1000\r
    // each of these bodies has their acceleration accumulated into the shared memory space at \r
    // shared[tid] then we have to wait for all of the threads to finish, then we can collapse the shared \r
    // acceleration into a singular acceleration on i value. This will be happening PER workgroup.\r
\r
    workgroupBarrier();\r
    \r
    for (var s = 32u; s > 0u; s >>= 1u) { // this is just a bitwise shift, same as dividing by 2\r
        if (tid < s) {\r
            shared_accel[tid] += shared_accel[tid + s];\r
        }\r
        workgroupBarrier();\r
    }\r
    \r
    return shared_accel[0]; // all of the thread seeds 15, 54, 62 have been absorbed into thread id 0 \r
}\r
\r
fn dormand_prince8(this_body: u32, tid: u32, dt: f32, r0: vec3f, v0: vec3f) -> RKResult {\r
    \r
    // k1\r
    let drs1 = v0 * dt;\r
    let dvs1 = compute_total_accel(this_body, tid, r0) * dt;\r
    \r
    // k2\r
    let r2 = r0 + (1.0/5.0) * drs1;\r
    let v2 = v0 + (1.0/5.0) * dvs1;\r
    let drs2 = v2 * dt;\r
    let dvs2 = compute_total_accel(this_body, tid, r2) * dt;\r
    \r
    // k3\r
    let r3 = r0 + (3.0/40.0) * drs1 + (9.0/40.0) * drs2;\r
    let v3 = v0 + (3.0/40.0) * dvs1 + (9.0/40.0) * dvs2;\r
    let drs3 = v3 * dt;\r
    let dvs3 = compute_total_accel(this_body, tid, r3) * dt;\r
    \r
    // k4\r
    let r4 = r0 + (44.0/45.0) * drs1 + (-56.0/15.0) * drs2 + (32.0/9.0) * drs3;\r
    let v4 = v0 + (44.0/45.0) * dvs1 + (-56.0/15.0) * dvs2 + (32.0/9.0) * dvs3;\r
    let drs4 = v4 * dt;\r
    let dvs4 = compute_total_accel(this_body, tid, r4) * dt;\r
    \r
    // k5\r
    let r5 = r0 + (19372.0/6561.0) * drs1 + (-25360.0/2187.0) * drs2 + \r
                  (64448.0/6561.0) * drs3 + (-212.0/729.0) * drs4;\r
    let v5 = v0 + (19372.0/6561.0) * dvs1 + (-25360.0/2187.0) * dvs2 + \r
                  (64448.0/6561.0) * dvs3 + (-212.0/729.0) * dvs4;\r
    let drs5 = v5 * dt;\r
    let dvs5 = compute_total_accel(this_body, tid, r5) * dt;\r
    \r
    // k6\r
    let r6 = r0 + (9017.0/3168.0) * drs1 + (-355.0/33.0) * drs2 + \r
                  (46732.0/5247.0) * drs3 + (49.0/176.0) * drs4 + \r
                  (-5103.0/18656.0) * drs5;\r
    let v6 = v0 + (9017.0/3168.0) * dvs1 + (-355.0/33.0) * dvs2 + \r
                  (46732.0/5247.0) * dvs3 + (49.0/176.0) * dvs4 + \r
                  (-5103.0/18656.0) * dvs5;\r
    let drs6 = v6 * dt;\r
    let dvs6 = compute_total_accel(this_body, tid, r6) * dt;\r
    \r
    let drs5_order = (35.0/384.0) * drs1 + (500.0/1113.0) * drs3 + \r
                     (125.0/192.0) * drs4 + (-2187.0/6784.0) * drs5 + (11.0/84.0) * drs6;\r
    let dvs5_order = (35.0/384.0) * dvs1 + (500.0/1113.0) * dvs3 + \r
                     (125.0/192.0) * dvs4 + (-2187.0/6784.0) * dvs5 + (11.0/84.0) * dvs6;\r
    \r
    var result: RKResult;\r
    result.position = r0 + drs5_order;\r
    result.velocity = v0 + dvs5_order;\r
    return result;\r
}\r
\r
@compute @workgroup_size(64) \r
fn cs(@builtin(workgroup_id) wg_id: vec3u, @builtin(local_invocation_id) local_id: vec3u) {\r
    let this_body = wg_id.x;\r
    let tid = local_id.x;\r
    \r
    let r0 = scene.spheres[this_body].position;\r
    let v0 = scene.spheres[this_body].velocity;\r
    let dt = params.dt;\r
\r
    //let total_accel = compute_total_accel(this_body, tid, r0);\r
    let result = dormand_prince8(this_body, tid, dt, r0, v0);\r
\r
    if (tid == 0u) {\r
        scene.spheres[this_body].position = result.position;\r
        scene.spheres[this_body].velocity = result.velocity;\r
    }\r
}`;async function Me(){const h=await navigator.gpu?.requestAdapter();let e;try{e=await h?.requestDevice({requiredFeatures:["timestamp-query"]})}catch(n){console.warn("no timestamp-query",n),e=await h?.requestDevice()}if(!e){fail("Browser does not support webGPU");return}const t=document.querySelector("canvas"),r=t.getContext("webgpu"),s=navigator.gpu.getPreferredCanvasFormat();return r.configure({device:e,format:s}),{device:e,canvas:t,context:r,format:s}}function Re({canvas:h,device:e,render:t,onResize:r}){return s=>{for(const n of s){const c=n.target,l=n.contentBoxSize?.[0],g=l?.inlineSize??n.contentRect.width,P=l?.blockSize??n.contentRect.height;c.width=Math.max(1,Math.min(Math.round(g),e.limits.maxTextureDimension2D)),c.height=Math.max(1,Math.min(Math.round(P),e.limits.maxTextureDimension2D))}r&&r(),t()}}class Ce{constructor(e){this.device=e,this.querySet=null,this.resolveBuffer=null,this.resultBuffer=null,this.capacity=8,this.init()}init(){this.querySet=this.device.createQuerySet({type:"timestamp",count:this.capacity*2}),this.resolveBuffer=this.device.createBuffer({size:this.capacity*2*8,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC}),this.resultBuffer=this.device.createBuffer({size:this.capacity*2*8,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ})}async getResults(){await this.resultBuffer.mapAsync(GPUMapMode.READ);const e=new BigInt64Array(this.resultBuffer.getMappedRange()),t=[];for(let r=0;r<this.capacity;r++){const s=e[r*2],n=e[r*2+1];s!==0n&&n!==0n&&t.push({index:r,durationNs:Number(n-s),durationMs:Number(n-s)/1e6})}return this.resultBuffer.unmap(),t}destroy(){this.querySet.destroy(),this.resolveBuffer.destroy(),this.resultBuffer.destroy()}}class Te{constructor(e,t={}){this.device=e,this.gpuProfiler=new Ce(e),this.stats={frameCount:0,computeTimeMs:0,renderTimeMs:0,totalTimeMs:0,avgComputeMs:0,avgRenderMs:0,avgTotalMs:0,splatCount:0,totalRays:0,successfulRays:0,chainIterations:0},this.enabled=t.enableProfiling??!0,this.logInterval=t.logInterval??60,this.framesSinceLog=0,this.splatReadBuffer=null,this.statsReadBuffer=null,this.initialized=!1}initializeReadBuffers(){this.initialized||(this.splatReadBuffer=this.device.createBuffer({label:"splat read buffer",size:4,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),this.statsReadBuffer=this.device.createBuffer({label:"stats read buffer",size:12,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),this.initialized=!0)}writeComputeStart(e){this.enabled&&e.writeTimestamp(this.gpuProfiler.querySet,0)}writeComputeEnd(e){this.enabled&&e.writeTimestamp(this.gpuProfiler.querySet,1)}writeRenderStart(e){this.enabled&&e.writeTimestamp(this.gpuProfiler.querySet,2)}writeRenderEnd(e){this.enabled&&e.writeTimestamp(this.gpuProfiler.querySet,3)}copyBuffersForReading(e,t,r){this.enabled&&(this.initializeReadBuffers(),e.copyBufferToBuffer(t,0,this.splatReadBuffer,0,4),e.copyBufferToBuffer(r,0,this.statsReadBuffer,0,12))}resolveQueries(e){this.enabled&&(e.resolveQuerySet(this.gpuProfiler.querySet,0,4,this.gpuProfiler.resolveBuffer,0),e.copyBufferToBuffer(this.gpuProfiler.resolveBuffer,0,this.gpuProfiler.resultBuffer,0,this.gpuProfiler.resultBuffer.size))}async updateStats(e){if(!this.enabled)return;const t=await this.gpuProfiler.getResults();if(t.length>=2){const n=t[0].durationMs,c=t[1].durationMs,l=n+c;this.stats.frameCount++,this.stats.computeTimeMs+=n,this.stats.renderTimeMs+=c,this.stats.totalTimeMs+=l,this.stats.avgComputeMs=this.stats.computeTimeMs/this.stats.frameCount,this.stats.avgRenderMs=this.stats.renderTimeMs/this.stats.frameCount,this.stats.avgTotalMs=this.stats.totalTimeMs/this.stats.frameCount}await this.splatReadBuffer.mapAsync(GPUMapMode.READ);const r=new Uint32Array(this.splatReadBuffer.getMappedRange());this.stats.splatCount=r[0],this.splatReadBuffer.unmap(),await this.statsReadBuffer.mapAsync(GPUMapMode.READ);const s=new Uint32Array(this.statsReadBuffer.getMappedRange());this.stats.totalRays=s[0],this.stats.successfulRays=s[1],this.stats.chainIterations=s[2],this.statsReadBuffer.unmap(),this.framesSinceLog++,this.framesSinceLog>=this.logInterval&&(this.logStats(e),this.framesSinceLog=0)}logStats(e){const t=e*1e3,r=1e3/this.stats.avgTotalMs,s=1/e,n=this.stats.totalRays/(this.stats.avgComputeMs/1e3);console.log("Performance Stats -----------------------|"),console.log(`Frames: ${this.stats.frameCount}`),console.log(`Splats: ${this.stats.splatCount}`),console.log(`Total rays: ${this.stats.totalRays}`),console.log(`Successful rays: ${this.stats.successfulRays}`),console.log(`Chain iterations: ${this.stats.chainIterations}`),console.log(`Avg Compute: ${this.stats.avgComputeMs.toFixed(3)} ms`),console.log(`Avg Render:  ${this.stats.avgRenderMs.toFixed(3)} ms`),console.log(`Avg Total (GPU):   ${this.stats.avgTotalMs.toFixed(3)} ms`),console.log(`Avg Total (CPU):         ${t.toFixed(5)} ms`),console.log(`GPU FPS:         ${r.toFixed(1)}`),console.log(`CPU FPS:         ${s.toFixed(1)}`),console.log(`Theoretical rays/s: ${n.toExponential(2)}`)}reset(){this.stats.frameCount=0,this.stats.computeTimeMs=0,this.stats.renderTimeMs=0,this.stats.totalTimeMs=0,this.stats.avgComputeMs=0,this.stats.avgRenderMs=0,this.stats.avgTotalMs=0,this.stats.splatCount=0,this.stats.totalRays=0,this.stats.successfulRays=0,this.stats.chainIterations=0,this.framesSinceLog=0}setEnabled(e){this.enabled=e,e||this.reset()}setLogInterval(e){this.logInterval=Math.max(1,e)}getStats(){return{...this.stats}}destroy(){this.splatReadBuffer&&this.splatReadBuffer.destroy(),this.statsReadBuffer&&this.statsReadBuffer.destroy()}}const m={FORWARD:0,BACKWARD:1,LEFT:2,RIGHT:3,UP:4,DOWN:5};class Ge{constructor(e=[0,0,0],t=[0,1,0],r=-90,s=0){this.position=a.create(...e),this.worldUp=a.create(...t),this.yaw=r,this.pitch=s,this.front=a.create(0,0,-1),this.up=a.create(0,1,0),this.right=a.create(1,0,0),this.movementSpeed=1,this.mouseSensitivity=.1,this.zoom=45,this.baseSpeed=1,this.sprintMultiplier=4,this.updateCameraVectors()}updateCameraVectors(){const e=a.create(Math.cos(this.yaw*Math.PI/180)*Math.cos(this.pitch*Math.PI/180),Math.sin(this.pitch*Math.PI/180),Math.sin(this.yaw*Math.PI/180)*Math.cos(this.pitch*Math.PI/180));this.front=a.normalize(e),this.right=a.normalize(a.cross(this.front,this.worldUp)),this.up=a.normalize(a.cross(this.right,this.front))}getViewMatrix(){const e=a.add(this.position,this.front);return M.lookAt(this.position,e,this.up)}getProjectionMatrix(e,t=.1,r=1e3){return M.perspective(this.zoom*Math.PI/180,e,t,r)}processKeyboard(e,t){const r=this.movementSpeed*t;switch(e){case m.FORWARD:this.position=a.add(this.position,a.mulScalar(this.front,r));break;case m.BACKWARD:this.position=a.sub(this.position,a.mulScalar(this.front,r));break;case m.LEFT:this.position=a.sub(this.position,a.mulScalar(this.right,r));break;case m.RIGHT:this.position=a.add(this.position,a.mulScalar(this.right,r));break;case m.UP:this.position=a.add(this.position,a.mulScalar(this.up,r));break;case m.DOWN:this.position=a.sub(this.position,a.mulScalar(this.up,r));break}}setSprinting(e){this.movementSpeed=e?this.baseSpeed*this.sprintMultiplier:this.baseSpeed}processMouseMovement(e,t,r=!0){e*=this.mouseSensitivity*(this.zoom/50),t*=this.mouseSensitivity*(this.zoom/50),this.yaw+=e,this.pitch+=t,r&&(this.pitch>89&&(this.pitch=89),this.pitch<-89&&(this.pitch=-89)),this.updateCameraVectors()}processMouseScroll(e){this.zoom+=e,this.zoom<1&&(this.zoom=1),this.zoom>45&&(this.zoom=45)}getDebugInfo(){return{position:Array.from(this.position),yaw:this.yaw,pitch:this.pitch,zoom:this.zoom,speed:this.movementSpeed}}}class X{constructor(e=20){this.resolution=e,this.vertices=[],this.normals=[],this.texCoords=[],this.indices=[],this.generateGeometry(1),this.interleaveVertices()}generateGeometry(e){const t=this.resolution,r=2*Math.PI/t,s=Math.PI/t;for(let n=0;n<=t;n++){const c=Math.PI/2-n*s,l=e*Math.cos(c),g=e*Math.sin(c);for(let P=0;P<=t;P++){const D=P*r,I=l*Math.cos(D),i=l*Math.sin(D);this.vertices.push(I,g,i),this.normals.push(I,g,i);const x=P/t,L=n/t;this.texCoords.push(x,L)}}for(let n=0;n<t;n++){let c=n*(t+1),l=c+t+1;for(let g=0;g<t;g++)n!==0&&this.indices.push(c,l,c+1),n!==t-1&&this.indices.push(c+1,l,l+1),c++,l++}}interleaveVertices(){this.interleavedVertices=[];for(let e=0;e<this.vertices.length/3;e++)this.interleavedVertices.push(this.vertices[3*e],this.vertices[3*e+1],this.vertices[3*e+2],this.texCoords[2*e],this.texCoords[2*e+1],this.normals[3*e],this.normals[3*e+1],this.normals[3*e+2])}getVertexData(){return new Float32Array(this.interleavedVertices)}getIndexData(){return new Uint32Array(this.indices)}getIndexCount(){return this.indices.length}static getVertexBufferLayout(){return{arrayStride:32,attributes:[{shaderLocation:0,offset:0,format:"float32x3"},{shaderLocation:1,offset:12,format:"float32x2"},{shaderLocation:2,offset:20,format:"float32x3"}]}}}class ze{constructor(e,t,r=20){this.device=e,this.mesh=new X(r),this.createBuffers(),this.createPipeline(t)}createBuffers(){this.vertexBuffer=this.device.createBuffer({label:"sphere vertices",size:this.mesh.getVertexData().byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),this.device.queue.writeBuffer(this.vertexBuffer,0,this.mesh.getVertexData()),this.indexBuffer=this.device.createBuffer({label:"sphere indices",size:this.mesh.getIndexData().byteLength,usage:GPUBufferUsage.INDEX|GPUBufferUsage.COPY_DST}),this.device.queue.writeBuffer(this.indexBuffer,0,this.mesh.getIndexData())}createPipeline(e){const t=this.device.createShaderModule({label:"sphere shader",code:Se});this.pipeline=this.device.createRenderPipeline({layout:"auto",vertex:{module:t,buffers:[X.getVertexBufferLayout()]},fragment:{module:t,targets:[{format:e}]},primitive:{topology:"triangle-list",cullMode:"none"},depthStencil:{depthWriteEnabled:!0,depthCompare:"less",format:"depth24plus"}})}createBindGroup(e,t){this.bindGroup=this.device.createBindGroup({label:"sphere bind group",layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:e}},{binding:1,resource:{buffer:t}}]})}render(e,t){e.setPipeline(this.pipeline),e.setBindGroup(0,this.bindGroup),e.setVertexBuffer(0,this.vertexBuffer),e.setIndexBuffer(this.indexBuffer,"uint32"),e.drawIndexed(this.mesh.getIndexCount(),t,0,0,0)}}class De{constructor(e,t){this.canvas=e,this.camera=t,this.firstMouse=!0,this.lastX=e.width/2,this.lastY=e.height/2,this.mouseDown=!1,this.keys={},this.lastFrame=performance.now(),this.deltaTime=0,this.setupEventListeners()}setupEventListeners(){window.addEventListener("keydown",e=>{this.keys[e.code]=!0,e.code==="ShiftLeft"&&this.camera.setSprinting(!0),e.code==="KeyP"&&this.onKeyP&&this.onKeyP(),e.code==="KeyO"&&this.onKeyO&&this.onKeyO(),e.code==="KeyI"&&this.onKeyI&&this.onKeyI()}),window.addEventListener("keyup",e=>{this.keys[e.code]=!1,e.code==="ShiftLeft"&&this.camera.setSprinting(!1)}),this.canvas.addEventListener("mousedown",e=>{this.mouseDown=!0,this.canvas.requestPointerLock()}),this.canvas.addEventListener("mouseup",()=>{this.mouseDown=!1}),document.addEventListener("mousemove",e=>{if(document.pointerLockElement===this.canvas){const t=e.movementX,r=-e.movementY;this.camera.processMouseMovement(t,r)}}),this.canvas.addEventListener("wheel",e=>{e.preventDefault(),this.camera.processMouseScroll(e.deltaY*.01)}),document.addEventListener("pointerlockchange",()=>{document.pointerLockElement!==this.canvas&&(this.mouseDown=!1)})}update(){const e=performance.now();return this.deltaTime=(e-this.lastFrame)/1e3,this.lastFrame=e,this.keys.KeyW&&this.camera.processKeyboard(m.FORWARD,this.deltaTime),this.keys.KeyS&&this.camera.processKeyboard(m.BACKWARD,this.deltaTime),this.keys.KeyA&&this.camera.processKeyboard(m.LEFT,this.deltaTime),this.keys.KeyD&&this.camera.processKeyboard(m.RIGHT,this.deltaTime),this.keys.Space&&this.camera.processKeyboard(m.UP,this.deltaTime),this.keys.KeyC&&this.camera.processKeyboard(m.DOWN,this.deltaTime),this.deltaTime}isKeyPressed(e){return this.keys[e]||!1}setKeyCallback(e,t){this[`onKey${e.slice(-1)}`]=t}}class Ie{constructor(e,t,r,s){this.device=e,this.recWidth=r,this.recHeight=s,this.createBuffers(),this.createPipeline(t)}createBuffers(){const e=new Float32Array(24);e.set([-this.recWidth/2,-this.recHeight/2,0,0,this.recWidth/2,this.recHeight/2,1,1,this.recWidth/2,-this.recHeight/2,1,0,-this.recWidth/2,-this.recHeight/2,0,0,this.recWidth/2,this.recHeight/2,1,1,-this.recWidth/2,this.recHeight/2,0,1]),this.vertexBuffer=this.device.createBuffer({label:"rectangle vertices",size:e.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),this.device.queue.writeBuffer(this.vertexBuffer,0,e)}createPipeline(e){const t=this.device.createShaderModule({label:"sphere shader",code:Pe});this.pipeline=this.device.createRenderPipeline({layout:"auto",vertex:{module:t,buffers:[{arrayStride:16,attributes:[{shaderLocation:0,offset:0,format:"float32x2"},{shaderLocation:1,offset:8,format:"float32x2"}]}]},fragment:{module:t,targets:[{format:e}]},depthStencil:{depthWriteEnabled:!0,depthCompare:"less",format:"depth24plus"}})}createBindGroup(e,t,r){this.bindGroup=this.device.createBindGroup({label:"billboard bind group",layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:e}},{binding:1,resource:{buffer:t}},{binding:2,resource:{buffer:r}}]})}render(e){e.setPipeline(this.pipeline),e.setBindGroup(0,this.bindGroup),e.setVertexBuffer(0,this.vertexBuffer),e.draw(6,1)}}async function ke(){let h=0,e=1,t=0;const r=.6,s=.35,n=[1920,1080],c=.065,l=.55,g=2,P=l+g*.8,D=r,I=s,{device:i,canvas:x,context:L,format:Q}=await Me(),R={enableProfiling:!1,logInterval:60,noise:0},b=new Te(i,{enableProfiling:R.enableProfiling,logInterval:R.logInterval}),V=new we;new X(20);const Z=new ze(i,Q,20),J=new Ie(i,Q,D,I),B=new Ge([0,0,l],[0,1,0],-90,0),k=new De(x,B);k.setKeyCallback("KeyP",()=>{h=!h}),k.setKeyCallback("KeyO",()=>{e=!e}),k.setKeyCallback("KeyI",()=>{t=!t});const E=i.createBuffer({label:"uniforms",size:24,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),O=new Float32Array(5),ce=O.subarray(0,2),ue=O.subarray(2,4),K=O.subarray(4,5);ce.set(n),ue.set([r,s]),K.set([R.noise]),i.queue.writeBuffer(E,0,O);const C=i.createBuffer({label:"matrix uniforms",size:256,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),le=M.identity(),T=4,ee=48+32*T,te=new ArrayBuffer(ee),d=new DataView(te);let o=0;d.setFloat32(o,-c/2,!0),o+=4,d.setFloat32(o,0,!0),o+=4,d.setFloat32(o,l,!0),o+=4,d.setFloat32(o,0,!0),o+=4,d.setFloat32(o,c/2,!0),o+=4,d.setFloat32(o,0,!0),o+=4,d.setFloat32(o,l,!0),o+=4,d.setFloat32(o,0,!0),o+=4,d.setUint32(o,T,!0),o+=4,o+=12;const N=1;for(let f=0;f<T;f++){let S=(Math.random()-.5)*2*N,v=(Math.random()-.5)*2*N,w=-Math.random()*g*N,_=Math.random()*.25;d.setFloat32(o,S,!0),o+=4,d.setFloat32(o,v,!0),o+=4,d.setFloat32(o,w,!0),o+=4,d.setFloat32(o,_,!0),o+=4,d.setFloat32(o,0,!0),o+=4,d.setFloat32(o,0,!0),o+=4,d.setFloat32(o,0,!0),o+=4,d.setFloat32(o,_,!0),o+=4}const G=i.createBuffer({label:"scene storage",size:ee,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});i.queue.writeBuffer(G,0,te);const fe=16+1e4*16,z=i.createBuffer({label:"splat storage",size:fe,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC}),de=new Uint32Array(1);i.queue.writeBuffer(z,0,de),i.createBuffer({label:"splat read buffer",size:4,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});const Y=i.createBuffer({label:"stats",size:12,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC});i.createBuffer({label:"stats read",size:12,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});const re=i.createBuffer({label:"background plane buffer",size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),he=i.createShaderModule({code:Be}),ne=i.createComputePipeline({label:"storage texture",layout:"auto",compute:{module:he}}),pe=i.createBindGroup({label:"compute",layout:ne.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:E}},{binding:1,resource:{buffer:C}},{binding:2,resource:{buffer:G}},{binding:3,resource:{buffer:z}},{binding:4,resource:{buffer:Y}},{binding:5,resource:{buffer:re}}]});Z.createBindGroup(C,G),J.createBindGroup(E,z,C);const se=i.createBuffer({label:"physics params",size:8,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),j=new Float32Array(2);j[0]=.016,j[1]=.006674,i.queue.writeBuffer(se,0,j);const me=i.createShaderModule({code:Ue}),ie=i.createComputePipeline({label:"nbody physics",layout:"auto",compute:{module:me}}),ve=i.createBindGroup({label:"physics",layout:ie.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:G}},{binding:1,resource:{buffer:se}}]});let A;function oe(){A&&A.destroy(),A=i.createTexture({size:[x.width,x.height],format:"depth24plus",usage:GPUTextureUsage.RENDER_ATTACHMENT})}oe();const W={colorAttachments:[{view:null,clearValue:[.3,.3,.3,1],loadOp:"clear",storeOp:"store"}],depthStencilAttachment:{view:null,depthClearValue:1,depthLoadOp:"clear",depthStoreOp:"store"}};let H=!1;function _e(f,S,v,w){const _=v.right,y=w/2,U=a.sub(v.position,a.mulScalar(_,y)),p=a.add(v.position,a.mulScalar(_,y)),u=new Float32Array(8);u[0]=U[0],u[1]=U[1],u[2]=U[2],u[3]=0,u[4]=p[0],u[5]=p[1],u[6]=p[2],u[7]=0,f.queue.writeBuffer(S,0,u)}function ge(f,S=l){const v=a.add(f.position,a.mulScalar(f.front,S)),w=a.negate(f.front),_=f.right,y=f.up;return M.create(_[0],_[1],_[2],0,y[0],y[1],y[2],0,w[0],w[1],w[2],0,v[0],v[1],v[2],1)}const ye=M.translate(le,[0,0,0]),xe=M.scale(ye,[1,1,1]);M.rotateZ(xe,0);async function ae(){if(H)return;H=!0;const f=k.update();W.colorAttachments[0].view=L.getCurrentTexture().createView(),W.depthStencilAttachment.view=A.createView();const S=ge(B,l),v=B.getViewMatrix(),w=x.width/x.height,_=B.getProjectionMatrix(w);i.queue.writeBuffer(C,128,v),i.queue.writeBuffer(C,192,_),h&&(i.queue.writeBuffer(C,0,S),i.queue.writeBuffer(C,64,M.inverse(S))),_e(i,G,B,c);const y=a.add(B.position,a.mulScalar(B.front,P)),U=a.negate(B.front),p=new Float32Array(8);p[0]=U[0],p[1]=U[1],p[2]=U[2],p[3]=0,p[4]=y[0],p[5]=y[1],p[6]=y[2],p[7]=0,i.queue.writeBuffer(re,0,p);const u=i.createCommandEncoder({});if(t){const q=u.beginComputePass();q.setPipeline(ie),q.setBindGroup(0,ve),q.dispatchWorkgroups(T),q.end()}u.clearBuffer(z,0,4),u.clearBuffer(Y,0,12),b.writeComputeStart(u);const F=u.beginComputePass();F.setPipeline(ne),F.setBindGroup(0,pe),F.dispatchWorkgroups(Math.ceil(1024/64)),F.end(),b.writeComputeEnd(u),b.writeRenderStart(u);const $=u.beginRenderPass(W);J.render($),e&&Z.render($,T),$.end(),b.writeRenderEnd(u),b.copyBuffersForReading(u,z,Y),b.resolveQueries(u);const be=u.finish();i.queue.submit([be]),await b.updateStats(f),H=!1,requestAnimationFrame(ae)}V.add(R,"enableProfiling").name("profiling").onChange(f=>b.setEnabled(f)),V.add(R,"logInterval",1,300).name("interval").onChange(f=>b.setLogInterval(f)),V.add(R,"noise",1,5e3).name("noise count").onChange(f=>{R.noise=f,K.set([f]),i.queue.writeBuffer(E,16,K)}),new ResizeObserver(Re({canvas:x,device:i,render:ae,onResize:oe})).observe(x)}ke();
