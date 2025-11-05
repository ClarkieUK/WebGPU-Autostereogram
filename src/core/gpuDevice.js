export async function initGPU(canvas) {

  const adapter = await navigator.gpu?.requestAdapter();
  const device = await adapter.requestDevice();

  const format = navigator.gpu.getPreferredCanvasFormat();
  const context = canvas.getContext('webgpu');
  
  context.configure({ 
    device, 
    format: format 
  });

  return { device, context, format };
  
}