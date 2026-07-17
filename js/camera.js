// js/camera.js
import { SimulationEngine } from './simulation.js';
import { EventBus, EVENTS } from './events.js';
import { WIDTH, HEIGHT } from './config.js';

let selectedIds = new Set();

// Камера сама знає, за ким стежити, завдяки EventBus
EventBus.on(EVENTS.SELECTION_CHANGED, (ids) => {
  selectedIds = ids;
});

export function focusOnPosition(x, y) {
  const targetX = Math.max(0, Math.min(x - window.innerWidth / 2, WIDTH - window.innerWidth));
  const targetY = Math.max(0, Math.min(y - window.innerHeight / 2, HEIGHT - window.innerHeight));
  window.scrollTo({ left: targetX, top: targetY, behavior: 'smooth' });
}

export function updateCamera() {
  if (selectedIds.size === 0) return;

  let sx = 0, sy = 0, n = 0;
  const allBalls = SimulationEngine.getBalls();
  for (const id of selectedIds) {
    const b = allBalls.find(u => u.id === id);
    if (!b || !b.alive) continue;
    const c = SimulationEngine.ballCenter(b);
    sx += c.cx; 
    sy += c.cy; 
    n++;
  }
  if (n === 0) return;

  const avgX = sx / n;
  const avgY = sy / n;

  const targetX = Math.max(0, Math.min(avgX - window.innerWidth / 2, WIDTH - window.innerWidth));
  const targetY = Math.max(0, Math.min(avgY - window.innerHeight / 2, HEIGHT - window.innerHeight));

  const curX = window.scrollX;
  const curY = window.scrollY;
  const FOLLOW_SPEED = 0.07;

  window.scrollTo(
    curX + (targetX - curX) * FOLLOW_SPEED,
    curY + (targetY - curY) * FOLLOW_SPEED
  );
}