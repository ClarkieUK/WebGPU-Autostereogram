struct Sphere {
    centre: vec3f, // then padded with a f32
    radius: f32,   // starts after 4 * f32 (16 bytes) 
}; // 32 bytes

struct Plane {
    normal: vec3f, // then padded with a f32
    origin: vec3f, // 
} // rounds to 32 bytes

struct Ray {
    origin: vec3f, // then padded with f32
    direction: vec3f, 
} // rounded to 32 bytes

struct Scene {
    left_eye: vec4f,
    right_eye: vec4f,
    sphere_count: u32,
    _pad: vec3u,
    sphere: array<Sphere>,
}

@group(0) @binding(0) var<storage, read_write> data: array<f32>;


fn hash1(p: f32) -> f32 {
    return fract(sin(p) * 43758.5453123);
}

fn hash3(p: f32) -> vec3f {
    return vec3f(
        hash1(p + 1.0),
        hash1(p + 2.0),
        hash1(p + 3.0),
    );
}

fn splat(r: f32, color: vec3f) -> vec4f {

    let sigma : f32 = 0.025; 

    //let inv_sigma2 = 1.0 / (2.0 * sigma * sigma);

    //let closeness  = exp(- 5 * r * r * inv_sigma2);

    //let closeness  = cos(10*r);

    let closeness = 1.3 * exp(-(10 * r * r)/(2 * sigma * sigma)) - 0.20;

    return vec4f((closeness) * color, 1.0);

}


@compute @workgroup_size(1) 
fn cs( @builtin(global_invocation_id) id : vec3u )  {
    

    let i = id.x;
    let foo = data[0];
    
}

/* 
for (i in len(numSplats)) {

pick random (x,y) on rectangle

find all left eye ray t parameter values, pick minimum t as closest scene intersection point, 
also find window intersection point (drawing rectangle)

cast right eye ray to that scene intersection point, find smallest t, evaluate position, if missmatch then pass skip.
find subsequent rectangle intersection point,

this becomes new starting left eye point, continue this process until right eye drawing intersection
is outside of rectangle 

repeat this process for the leftward direction

}
*/