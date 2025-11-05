@group(0) @binding(0) var<uniform> grid: vec2f;
@group(0) @binding(1) var<storage> cellStateIn: array<u32>;
@group(0) @binding(2) var<storage, read_write> cellStateOut: array<u32>;

struct computeInput {
    @builtin(global_invocation_id) cell: vec3u,
}

fn cellIndex(cell: vec2u) -> u32 {
    return (cell.y % u32(grid.y)) * u32(grid.x) +
           (cell.x % u32(grid.x));
}

fn cellActive(x: u32, y: u32) -> u32 {
    return cellStateIn[cellIndex(vec2(x, y))];
}

@compute @workgroup_size(8, 8)
fn computeMain(input: computeInput) {
    let cell = input.cell;

    let activeNeighbors = cellActive(cell.x+1, cell.y+1) +
                        cellActive(cell.x+1, cell.y) +
                        cellActive(cell.x+1, cell.y-1) +
                        cellActive(cell.x, cell.y-1) +
                        cellActive(cell.x-1, cell.y-1) +
                        cellActive(cell.x-1, cell.y) +
                        cellActive(cell.x-1, cell.y+1) +
                        cellActive(cell.x, cell.y+1);

    if (cellStateIn[cellIndex(cell.xy)] == 1) {
        cellStateOut[cellIndex(cell.xy)] = 0;
    }
    else {
        cellStateOut[cellIndex(cell.xy)] = 1;
    }

    let i = cellIndex(cell.xy);

    switch activeNeighbors {
    case 2: { 
        cellStateOut[i] = cellStateIn[i];
    }
    case 3: { 
        cellStateOut[i] = 1;
    }
    default: { 
        cellStateOut[i] = 0;
    }
    }

}