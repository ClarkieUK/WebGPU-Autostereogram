struct MatrixUniforms {
    model: mat4x4<f32>,
    inverse_model: mat4x4<f32>,
    view: mat4x4<f32>,
    projection: mat4x4<f32>,
};

struct Sphere {
    centre: vec3f,
    radius: f32,
};

struct Scene {
    left_eye: vec4f,
    right_eye: vec4f,
    sphere_count: u32,
    spheres: array<Sphere>,
};

@group(0) @binding(0) var<uniform> matrixUniforms: MatrixUniforms;
@group(0) @binding(1) var<storage, read> scene: Scene;

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) normal: vec3f,
    @location(1) worldPos: vec3f,
};

// Icosphere vertices (20 faces, 12 vertices)
const PHI: f32 = 1.618033988749895;

var<private> base_vertices: array<vec3f, 12> = array<vec3f, 12>(
    vec3f(-1.0,  PHI,  0.0),
    vec3f( 1.0,  PHI,  0.0),
    vec3f(-1.0, -PHI,  0.0),
    vec3f( 1.0, -PHI,  0.0),
    vec3f( 0.0, -1.0,  PHI),
    vec3f( 0.0,  1.0,  PHI),
    vec3f( 0.0, -1.0, -PHI),
    vec3f( 0.0,  1.0, -PHI),
    vec3f( PHI,  0.0, -1.0),
    vec3f( PHI,  0.0,  1.0),
    vec3f(-PHI,  0.0, -1.0),
    vec3f(-PHI,  0.0,  1.0)
);

// Icosphere indices (20 triangles)
var<private> indices: array<u32, 60> = array<u32, 60>(
    0, 11, 5,   0, 5, 1,    0, 1, 7,    0, 7, 10,   0, 10, 11,
    1, 5, 9,    5, 11, 4,   11, 10, 2,  10, 7, 6,   7, 1, 8,
    3, 9, 4,    3, 4, 2,    3, 2, 6,    3, 6, 8,    3, 8, 9,
    4, 9, 5,    2, 4, 11,   6, 2, 10,   8, 6, 7,    9, 8, 1
);

@vertex
fn vs_main(
    @builtin(vertex_index) vertexIndex: u32,
    @builtin(instance_index) instanceIndex: u32
) -> VertexOutput {
    var output: VertexOutput;
    
    if (instanceIndex >= scene.sphere_count) {
        output.position = vec4f(0.0);
        return output;
    }
    
    let sphere = scene.spheres[instanceIndex];
    let idx = indices[vertexIndex];
    let vertex = normalize(base_vertices[idx]);
    
    // Transform to world space
    let worldPos = sphere.centre + vertex * sphere.radius;
    output.worldPos = worldPos;
    output.normal = vertex;
    
    // Transform to clip space
    output.position = matrixUniforms.projection * matrixUniforms.view * vec4f(worldPos, 1.0);
    
    return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4f {
    // Simple lighting
    let lightDir = normalize(vec3f(1.0, 1.0, 1.0));
    let diffuse = max(dot(input.normal, lightDir), 0.0);
    let ambient = 0.3;
    
    let color = vec3f(0.8, 0.3, 0.3); // Red sphere
    let finalColor = color * (ambient + diffuse * 0.7);
    
    return vec4f(finalColor, 1.0);
}