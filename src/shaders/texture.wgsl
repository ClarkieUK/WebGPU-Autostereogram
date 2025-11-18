// shader variables
@group(0) @binding(0) var ourSampler: sampler;
@group(0) @binding(1) var ourTexture: texture_2d<f32>;

// vertex shader
struct OurVertexShaderInput {
    @builtin(vertex_index) vertexIndex: u32,
}

struct OurVertexShaderOutput {
    @builtin(position) position: vec4f,
    @location(0) texcoord: vec2f,
};

@vertex
fn vs(vsInput: OurVertexShaderInput) -> OurVertexShaderOutput 
{
    /*let pos = array(
    // 1st triangle
    vec2f( 0.0,  0.0),  // center
    vec2f( 1.0,  0.0),  // right, center
    vec2f( 0.0,  1.0),  // center, top
 
    // 2nd triangle
    vec2f( 0.0,  1.0),  // center, top
    vec2f( 1.0,  0.0),  // right, center
    vec2f( 1.0,  1.0),  // right, top
    );*/

    let pos = array(
    // 1st triangle
    vec2f( -1.0,  -1.0),  // center
    vec2f( 1.0,  -1.0),  // right, center
    vec2f( 1.0,  1.0),  // center, top
 
    // 2nd triangle
    vec2f( -1.0,  -1.0),  // center, top
    vec2f( 1.0,  1.0),  // right, center
    vec2f( -1.0,  1.0),  // right, top
    );

    let xy = pos[vsInput.vertexIndex];

    var vsOutput: OurVertexShaderOutput;
    vsOutput.position = vec4f(xy, 0.0, 1.0);
    vsOutput.texcoord = (xy+1)/2;

    return vsOutput;
}

//fragment shader
struct OurFragmentShaderOutput {
    @location(0) color: vec4f,
}

@fragment 
fn fs(fsInput: OurVertexShaderOutput) -> OurFragmentShaderOutput
{
    var fsOutput: OurFragmentShaderOutput;

    fsOutput.color = textureSample(ourTexture, ourSampler, fsInput.texcoord);

    //fsOutput.color = vec4f(fsInput.texcoord, 0.0, 1.0);

    return fsOutput;
} 
