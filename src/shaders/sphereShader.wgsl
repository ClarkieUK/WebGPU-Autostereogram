struct MatrixUniforms {
    model: mat4x4f,
    inverseModel: mat4x4f,
    view: mat4x4f,
    projection: mat4x4f,
}

struct Sphere {
    centre: vec3f,
    radius: f32,
}

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
}

@vertex
fn vs(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    
    let sphere = scene.spheres[input.instanceIdx];
    
    let worldPos = input.position * sphere.radius + sphere.centre; // effectively the model matrix transform
    
    output.position = matrices.projection * matrices.view * vec4f(worldPos, 1.0);
    
    output.normal = normalize(input.normal);
    output.worldPos = worldPos;
    output.texCoord = input.texCoord;
    
    return output;
}

@fragment
fn fs(input: VertexOutput) -> @location(0) vec4f {    

    return vec4f(input.texCoord, 1.0, 1.0);
}