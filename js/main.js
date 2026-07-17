// js/main.js
import { SimulationEngine } from './simulation.js';
import { Renderer } from './renderer.js';
import { initInput } from './input.js';
import { updateCamera } from './camera.js'; 

let lastTs = performance.now();

function gameLoop(ts = performance.now()) {
  const dt = Math.min(0.1, (ts - lastTs) / 1000);
  lastTs = ts;

  SimulationEngine.tick(dt);
  Renderer.draw();

  requestAnimationFrame(gameLoop);
}

document.addEventListener('DOMContentLoaded', () => {
  SimulationEngine.init();
  initInput();
  requestAnimationFrame(gameLoop);
});