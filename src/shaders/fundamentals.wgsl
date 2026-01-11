//struct ourVsInput {
//    @builtin(vertex_index) vertexIndex : u32,
//    @builtin(instance_index) instanceIndex : u32
//}

struct Vertex {
    @location(0) position: vec2f,
    @location(1) color: vec4f,
    @location(2) offset: vec2f,
    @location(3) scale: vec2f,
    @location(4) perVertexColor: vec4f, // defaults to 0,0,0,1
}

struct ourVsOutput {
    @builtin(position) position: vec4f,
    @location(0) color : vec4f,
}

@vertex fn vs(vert: Vertex) -> ourVsOutput {

    var output: ourVsOutput;

    output.position = vec4f(
        vert.position * vert.scale + vert.offset, 0.0, 1.0
        );

    output.color = vert.color * vert.perVertexColor;
    
    return output;
}

@fragment fn fs(fsInput: ourVsOutput) -> @location(0) vec4f {
    
    return fsInput.color;

}