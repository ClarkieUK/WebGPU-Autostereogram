// @ts-nocheck
import { CameraMovement } from './camera.js';

export class InputHandler {
    constructor(canvas, camera) {
        this.canvas = canvas;
        this.camera = camera;
        
        this.firstMouse = true;
        this.lastX = canvas.width / 2;
        this.lastY = canvas.height / 2;
        this.mouseDown = false;
        
        this.keys = {};
        
        this.lastFrame = performance.now();
        this.deltaTime = 0;
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // keyboard events
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;

            if (e.code === 'ShiftLeft') {
                this.camera.setSprinting(true);
            }

            if (e.code === 'KeyP') {
                if (this.onKeyP) this.onKeyP();
            }

            if (e.code === 'KeyO') {
                if (this.onKeyO) this.onKeyO();
            }

        });
        
        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
            
            if (e.code === 'ShiftLeft') {
                this.camera.setSprinting(false);
            }
        });
        
        // only track when mouse is clicked
        this.canvas.addEventListener('mousedown', (e) => {
            this.mouseDown = true;
            this.canvas.requestPointerLock();
        });
        
        this.canvas.addEventListener('mouseup', () => {
            this.mouseDown = false;
        });
        
        document.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement === this.canvas) {
                const xOffset = e.movementX;
                const yOffset = -e.movementY; // reversed since y-coordinates go from bottom to top
                
                this.camera.processMouseMovement(xOffset, yOffset);
            }
        });
        
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.camera.processMouseScroll(e.deltaY * 0.01);
        });
        
        document.addEventListener('pointerlockchange', () => {
            if (document.pointerLockElement !== this.canvas) {
                this.mouseDown = false;
            }
        });
    }
    
    update() {
        const currentFrame = performance.now();
        this.deltaTime = (currentFrame - this.lastFrame) / 1000; // convert to seconds
        this.lastFrame = currentFrame;
        
        if (this.keys['KeyW']) {
            this.camera.processKeyboard(CameraMovement.FORWARD, this.deltaTime);
        }
        if (this.keys['KeyS']) {
            this.camera.processKeyboard(CameraMovement.BACKWARD, this.deltaTime);
        }
        if (this.keys['KeyA']) {
            this.camera.processKeyboard(CameraMovement.LEFT, this.deltaTime);
        }
        if (this.keys['KeyD']) {
            this.camera.processKeyboard(CameraMovement.RIGHT, this.deltaTime);
        }
        if (this.keys['Space']) {
            this.camera.processKeyboard(CameraMovement.UP, this.deltaTime);
        }
        if (this.keys['KeyC']) {
            this.camera.processKeyboard(CameraMovement.DOWN, this.deltaTime);
        }
        
        return this.deltaTime;
    }
    
    isKeyPressed(code) {
        return this.keys[code] || false;
    }
 
    setKeyCallback(keyCode, callback) {
        this[`onKey${keyCode.slice(-1)}`] = callback;
}
}