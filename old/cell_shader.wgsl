@group(0) @binding(0) var<uniform> grid: vec2f;
@group(0) @binding(1) var<storage> cellState: array<u32>;
// note distinction between uniform and storage decleration
// using 32 bits for a boolean is wasteful and packing techniques do exist

// let = constant in wgsl and var = variable
// uniforms are typically fast tracked too with hardware
// and storage buffers are slower but more applicable in a sense


// vertex

struct vertexInput {
    @location(0) pos: vec2f,
    @builtin(instance_index) instance: u32,
}

struct vertexOutput {
    @builtin(position) pos: vec4f,
    @location(0) cell: vec2f,
}

@vertex
fn vertexMain(input: vertexInput) -> vertexOutput {

    let i = f32(input.instance);
    let cell = vec2f(i % grid.x,floor(i / grid.x));
    let state = f32(cellState[input.instance]);
    let cellOffset = cell / grid * 2; 
    let gridPos = (input.pos * state + 1) / grid - 1 + cellOffset; 

    var output: vertexOutput;
    output.pos = vec4f(gridPos, 0, 1);
    output.cell = cell;
    return output;
}

// fragment

struct fragmentInput {
    @location(0) cell: vec2f,
}

struct fragmentOutput {
    @location(0) color: vec4f,
}

@fragment
fn fragmentMain(input: fragmentInput) -> fragmentOutput {

    let c = input.cell / grid;

    var output: fragmentOutput;
    output.color = vec4f(c, 1-c.x, 1);
    return output;
}
