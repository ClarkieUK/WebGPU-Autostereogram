struct StaticStructs {
    color: vec4f, // floats are 32 bit 
    offset: vec2f, // notice how its 0mod8
    _padding: vec2f,
}

struct DynamicStructs {
    scale: vec2f,
    _padding: vec2f,
}

struct Vertex {
    position: vec2f,
}

struct Test {
    position: vec4f,
}

@group(0) @binding(0) var<storage, read> staticStructs: array<StaticStructs>;
@group(0) @binding(1) var<storage, read> dynamicStructs: array<DynamicStructs>;
@group(0) @binding(2) var<storage, read> vertex: array<Vertex>;

struct ourVsInput {
    @builtin(vertex_index) vertexIndex : u32,
    @builtin(instance_index) instanceIndex : u32
}

struct ourVsOutput {
    @builtin(position) position: vec4f,
    @location(0) color : vec4f,
}

@vertex fn vs(vsInput: ourVsInput) -> ourVsOutput {

    let pos = array(
        vec2f(-0.0, 0.5),
        vec2f(-0.5, -0.5),
        vec2f(0.5, -0.5)
    );

    let staticStruct = staticStructs[vsInput.instanceIndex];
    let dynamicStruct = dynamicStructs[vsInput.instanceIndex];

    var output: ourVsOutput;
    output.position = vec4f(
        vertex[vsInput.vertexIndex].position * dynamicStruct.scale + staticStruct.offset, 0.0, 1.0);
    output.color = staticStruct.color;
    return output;
}

@fragment fn fs(fsInput: ourVsOutput) -> @location(0) vec4f {
    
    return fsInput.color;

}