//struct ourVsInput {
//    @builtin(vertex_index) vertexIndex : u32,
//    @builtin(instance_index) instanceIndex : u32
//}

struct Uniforms {
    resolution: vec2f,
    translation: vec2f,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct Vertex {
    @location(0) position: vec2f,
    @location(1) texCoord: vec2f,
}

struct ourVsOutput {
    @builtin(position) position: vec4f,
    @location(0) texCoord: vec2f,
}

@vertex fn vs(vert: Vertex) -> ourVsOutput {

    var position = vert.position + uniforms.translation;              // input as pixel values
    position = position / uniforms.resolution; // move to between 0 and 1
    position = position * 2.0;                 // between 0 and 2 
    position = position - 1.0;                 // between -1 and 1
    position = position * vec2f(1, -1);        // flip y axis
    
    var output: ourVsOutput;
    output.position = vec4f(position, 0.0, 1.0);
    output.texCoord = vert.texCoord;
    return output;
}

@fragment fn fs(fsInput: ourVsOutput) -> @location(0) vec4f {
    
    return vec4f(fsInput.texCoord,0.0,1.0);
}