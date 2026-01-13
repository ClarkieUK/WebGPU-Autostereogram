//struct ourVsInput {
//    @builtin(vertex_index) vertexIndex : u32,
//    @builtin(instance_index) instanceIndex : u32
//}

@group(0) @binding(0) var texRead : texture_2d<f32>;

struct Vertex {
    @location(0) position: vec2f,
    @location(1) texCoord: vec2f,
}

struct ourVsOutput {
    @builtin(position) position: vec4f,
    @location(0) texCoord: vec2f,
}

@vertex fn vs(vert: Vertex) -> ourVsOutput {

    var output: ourVsOutput;

    output.position = vec4f(vert.position, 0.0, 3.0);
    output.texCoord = vert.texCoord;

    return output;
}

@fragment fn fs(fsInput: ourVsOutput) -> @location(0) vec4f {
    
    let dims = textureDimensions(texRead);
    let p = vec2i(fsInput.texCoord * vec2f(dims));
    return textureLoad(texRead, p, 0);

    //return vec4f(fsInput.texCoord,0.0,1.0);
}