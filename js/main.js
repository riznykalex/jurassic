// js/main.js
import { SimulationEngine } from './simulation.js';
import { Renderer } from './renderer.js';
import { initInput } from './input.js';
import { updateCamera } from './camera.js';
import { BALANCE } from './config.js';

let lastTs = performance.now();
let gameOver = false;

function showGameOver() {
  const overlay = document.createElement('div');
  overlay.id = 'game-over-overlay';
  overlay.innerHTML = `
    <div class="game-over-box">
      <h1>Гру закінчено</h1>
      <p>Ваше плем'я не вижило.</p>
      <button id="game-over-restart">Почати заново</button>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('game-over-restart').addEventListener('click', () => {
    window.location.reload();
  });
}

function gameLoop(ts = performance.now()) {
  const realDt = Math.min(0.1, (ts - lastTs) / 1000); // реальний плинний час, з захистом від "стрибків" (згорнула вкладка тощо)
  lastTs = ts;
  const dt = realDt * BALANCE.GAME_SPEED; // ефективний час симуляції - тут і відбувається сповільнення/прискорення

  SimulationEngine.tick(dt);
  Renderer.draw();

  if (!gameOver && !SimulationEngine.hasPlayerUnits()) {
    gameOver = true;
    showGameOver();
    return; // не плануємо наступний кадр - плем'я вимерло, гра остаточно завершена
  }

  if (!gameOver) requestAnimationFrame(gameLoop);
}

document.addEventListener('DOMContentLoaded', () => {
  SimulationEngine.init();
  initInput();
  requestAnimationFrame(gameLoop);
});
