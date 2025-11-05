struct OurStruct {
    color: vec4f,
    offset: vec2f,
};

struct OtherStruct {
    scale: vec2f,
}

@group(0)@binding(0) var<storage, read> ourStructs: array<OurStruct>;
@group(0)@binding(1) var<storage, read> otherStructs: array<OtherStruct>;

struct OurVertexShaderInput {
    @builtin(vertex_index) vertexIndex : u32,
    @builtin(instance_index) instanceIndex : u32,
};

struct OurVertexShaderOutput {
    @builtin(position) position : vec4f,
    @location(0) color: vec4f,
};


@vertex
fn vs(input: OurVertexShaderInput) -> OurVertexShaderOutput 
{

    let pos = array(
        vec2f(  0.0,  0.5),
        vec2f( -0.5, -0.5),
        vec2f(  0.5, -0.5),
    );
    
    let otherStruct = otherStructs[input.instanceIndex]; // sets current struct 
    let ourStruct = ourStructs[input.instanceIndex];     // based on instance index

    var vsOutput: OurVertexShaderOutput;
    
    vsOutput.position = vec4f(
        pos[input.vertexIndex] * otherStruct.scale + ourStruct.offset, 0.0, 1.0);

    vsOutput.color = ourStruct.color;

    return vsOutput; 
};

@fragment 
fn fs(fsInput: OurVertexShaderOutput) -> @location(0) vec4f {

    let red = vec4f(1, 0, 0, 1);
    let cyan = vec4f(0, 1, 1, 1);

    let grid = vec2u(fsInput.position.xy) / 16;

    let checker = (grid.x + grid.y) % 2 == 1;

    //return vec4f(fsInput.position.x,0.0,0.0,1.0);

    //return select(red, cyan, checker);

    return fsInput.color;

};