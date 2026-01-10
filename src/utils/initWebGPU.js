// @ts-nocheck
async function initWebGPU(){

    const adapter = await navigator.gpu?.requestAdapter();  
    const device = await adapter?.requestDevice();

    if (!device) {
        fail("Browser does not support webGPU");
        return;
    }

    const canvas = document.querySelector('canvas'); // grab canvas from html dim
    const context = canvas.getContext('webgpu');    
    const format = navigator.gpu.getPreferredCanvasFormat(); // how will webGPU draw to canvas?

    context.configure({
        device,
        format: format,
    })

    return {device, canvas, context, format}

}

function generateObserverCallback({ canvas, device, render }) {

  return (entries) => {
    for (const entry of entries) {
      const target = entry.target;


      const box = entry.contentBoxSize?.[0];
      const width = box?.inlineSize ?? entry.contentRect.width;
      const height = box?.blockSize ?? entry.contentRect.height;

      target.width = Math.max(1,Math.min(Math.round(width), device.limits.maxTextureDimension2D));
      target.height = Math.max(1,Math.min(Math.round(height), device.limits.maxTextureDimension2D));
    }

    render();
    
  };
}

export {initWebGPU, generateObserverCallback}; 