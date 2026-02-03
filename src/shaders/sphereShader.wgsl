struct MatrixUniforms {
    model: mat4x4f,
    inverseModel: mat4x4f,
    view: mat4x4f,
    projection: mat4x4f,
}

struct Sphere {
    position: vec3f,
    radius: f32,  
    velocity: vec3f,
    mass: f32,
}; 

struct Scene {
    left_eye: vec4f,
    right_eye: vec4f,
    sphere_count: u32,
    spheres: array<Sphere>, 
}

@group(0) @binding(0) var<uniform> matrices: MatrixUniforms;
@group(0) @binding(1) var<storage, read> scene: Scene;

struct VertexInput {
    @location(0) position: vec3f,
    @location(1) texCoord: vec2f,
    @location(2) normal: vec3f,
    @builtin(instance_index) instanceIdx: u32,
}

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) normal: vec3f,
    @location(1) worldPos: vec3f,
    @location(2) texCoord: vec2f,
    @location(3) absVelocity: f32,
}

@vertex
fn vs(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    
    let sphere = scene.spheres[input.instanceIdx];
    
    let worldPos = input.position * sphere.radius + sphere.position; // effectively the model matrix transform
    
    output.position = matrices.projection * matrices.view * vec4f(worldPos, 1.0);
    
    output.normal = normalize(input.normal);
    output.worldPos = worldPos;
    output.texCoord = input.texCoord;
    output.absVelocity = sqrt(dot(sphere.velocity,sphere.velocity));
    
    return output;
}

@fragment
fn fs(input: VertexOutput) -> @location(0) vec4f {    

    let t = clamp(input.absVelocity / 2.0, 0.0, 1.0);
    let color = viridis(t);
    
    return vec4f(color, 1.0);
    //return vec4f(0.2);
    //return vec4f(input.normal, 1.0);
    //return vec4f(input.texCoord, 1.0, 1.0);
    //return vec4f(input.worldPos, 1.0);
}

fn viridis(t: f32) -> vec3f {
    let c0 = vec3f(0.267, 0.005, 0.329);
    let c1 = vec3f(0.282, 0.514, 0.564);
    let c2 = vec3f(0.993, 0.906, 0.144);
    
    let t2 = t * t;
    return mix(mix(c0, c1, t), c2, t2);
}