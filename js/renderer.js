// js/renderer.js
import { SPECIES, BALANCE, WIDTH, HEIGHT } from './config.js';
import { SimulationEngine } from './simulation.js';
import { spriteFramePosition, formatValue, clamp } from './utils.js';
import { focusOnPosition } from './camera.js';

const game = document.getElementById('game');
const hud = document.getElementById('hud');
const ballDivs = new Map();
const foodDivs = new Map();
const poisonDivs = new Map();
const structureDivs = new Map();

const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
const vectorLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
vectorLine.setAttribute('stroke-width', '3');
vectorLine.setAttribute('stroke-dasharray', '6,6');
vectorLine.style.cssText = 'transition:opacity .3s linear;opacity:0;';
svg.appendChild(vectorLine);
game.appendChild(svg);

function showAimLine(cx, cy, mx, my, ok) {
  vectorLine.setAttribute('x1', cx);
  vectorLine.setAttribute('y1', cy);
  vectorLine.setAttribute('x2', mx);
  vectorLine.setAttribute('y2', my);
  vectorLine.setAttribute('stroke', ok ? '#4da6ff' : '#e74c3c');
  vectorLine.style.opacity = '1';
}

function hideAimLine() {
  vectorLine.style.opacity = '0';
}

function syncStructures() {
  const seen = new Set();
  const now = performance.now();
  for (const structure of SimulationEngine.getStructures()) {
    seen.add(structure.id);
    let div = structureDivs.get(structure.id);
    if (!div) {
      div = document.createElement('div');
      div.className = 'structure';
      div.style.backgroundImage = "url('./assets/stones.png')";
      div.style.backgroundRepeat = 'no-repeat';
      div.style.backgroundSize = '384px 64px';
      div.style.backgroundPosition = '0px 0px';
      div.style.imageRendering = 'pixelated';
      game.appendChild(div);
      structureDivs.set(structure.id, div);
    }
    const frameIndex = Number.isInteger(structure.frameIndex) ? structure.frameIndex : 0;
    div.style.left = `${structure.x - 32}px`;
    div.style.top = `${structure.y - 32}px`;
    div.style.width = '64px';
    div.style.height = '64px';
    div.style.backgroundPosition = `-${frameIndex * 64}px 0px`;
  }
  for (const [id, div] of structureDivs) {
    if (!seen.has(id)) {
      div.remove();
      structureDivs.delete(id);
    }
  }
}

function syncBalls() {
  const seen = new Set();
  const now = performance.now();

  for (const b of SimulationEngine.getBalls()) {
    if (!b.alive) continue;
    seen.add(b.id);

    let entry = ballDivs.get(b.id);
    if (!entry) {
      const wrap = document.createElement('div');
      wrap.className = 'unit';
      const label = document.createElement('div');
      label.className = 'unit-label';
      const barBg = document.createElement('div');
      barBg.className = 'bar-bg';
      const barFill = document.createElement('div');
      barFill.className = 'bar-fill';
      barBg.appendChild(barFill);
      const ball = document.createElement('div');
      ball.className = 'ball';

      const cfg = SPECIES[b.type];
      if (cfg.spriteFile) {
        const fs = cfg.spriteFrameSize || 64;
        ball.style.backgroundImage = `url('${cfg.spriteFile}')`;
        ball.style.border = 'none';
        ball.style.borderRadius = '0';
        ball.style.width = fs + 'px';
        ball.style.height = fs + 'px';
      } else {
        ball.style.borderWidth = '2px';
        ball.style.borderStyle = 'solid';
        ball.style.background = cfg.color;
      }

      wrap.appendChild(label);
      wrap.appendChild(barBg);
      wrap.appendChild(ball);
      game.appendChild(wrap);

      entry = { 
        wrap, label, barFill, ball,
        renderState: 'idle',
        lastStateUpdateAt: 0,
        smoothVx: 0,
        smoothVy: 0,
        turningUntil: 0,
        renderFacingLeft: false,
        renderDirClass: '',
        lastDirUpdateAt: 0,
        pendingFacingLeft: false,
        pendingDirClass: ''
      };
      ballDivs.set(b.id, entry);
    }

    const cfg = SPECIES[b.type];
    const size = SimulationEngine.ballSize(b);
    const maxE = SimulationEngine.maxEnergy(b);
    const frac = clamp(b.energy / maxE, 0, 1);

    entry.wrap.style.left = b.x + 'px';
    entry.wrap.style.top = b.y + 'px';
    entry.wrap.style.width = size + 'px';

    if (!cfg.spriteFile) {
      entry.ball.style.width = size + 'px';
      entry.ball.style.height = size + 'px';
      entry.ball.style.borderColor = b.isResting ? '#333' : '#111';
    }

// Визначаємо РЕАЛЬНУ фізичну швидкість
    const actualSpeed = Math.hypot(b.vx, b.vy);
    const IS_MOVING_THRESHOLD = 0.5; // Збільшили поріг для відсікання "тремору"

    // Визначення стану
    let rawState = 'idle';
    
    // Пріоритет №1: Атака (якщо в радіусі)
    if (b.attackTargetId !== null) {
      const target = SimulationEngine.getBalls().find(t => t.id === b.attackTargetId && t.alive);
      if (target) {
        const tc = SimulationEngine.ballCenter(target);
        const myc = SimulationEngine.ballCenter(b);
        const dd = Math.hypot(tc.cx - myc.cx, tc.cy - myc.cy);
        const bite = size / 2 + SimulationEngine.ballSize(target) / 2;
        rawState = dd < bite ? 'attack' : (actualSpeed > IS_MOVING_THRESHOLD ? 'walk' : 'idle');
      }
    } 
    // Пріоритет №2: Відпочинок
    // Відпочинок і простий стан використовуємо як один idle, щоб юніт
    // не перемикався на окремий "rest"-стан і не втрачав єдину анімацію.
    else if (b.isResting) {
      rawState = 'idle';
    } 
    // Пріоритет №3: Ходьба (тільки якщо швидкість суттєва)
    else if ((b.isMoving || b.manualTarget !== null) && actualSpeed > IS_MOVING_THRESHOLD) {
      rawState = 'walk';
    } 
    // За замовчуванням - стоїмо
    else {
      rawState = 'idle';
    }
// Визначаємо новий стан
    const newState = rawState;
    
    // Миттєво перемикаємося, якщо стан змінився (наприклад, walk -> idle)
    // АБО якщо минуло 300мс (для плавності, щоб не блимало при швидкій зміні кадрів)
    if (newState !== entry.renderState || now - entry.lastStateUpdateAt > 300) {
      entry.renderState = newState;
      entry.lastStateUpdateAt = now;
    }
    
    const state = entry.renderState;

    // Згладжування швидкості
    entry.smoothVx += (b.vx - entry.smoothVx) * 0.08;
    entry.smoothVy += (b.vy - entry.smoothVy) * 0.08;

    // Логіка повороту
    let forceTurnPose = false;
    if (now < entry.turningUntil) {
      forceTurnPose = true;
    } else if (entry.turningUntil !== 0) {
      entry.renderFacingLeft = entry.pendingFacingLeft;
      entry.renderDirClass = entry.pendingDirClass;
      entry.turningUntil = 0;
      // Пауза-охолодження одразу після завершення повороту: не дозволяємо
      // миттєво почати новий поворот, інакше шум швидкості (стадна
      // поведінка, гальмування) міг спричиняти мерехтіння туди-сюди.
      entry.lastDirUpdateAt = now;
    }

    if (!forceTurnPose && now - entry.lastDirUpdateAt > 200) {
      // Використовуємо ЗГЛАДЖЕНУ швидкість, а не миттєву b.vx/b.vy - сира
      // швидкість може смикатись (мікрокорекції курсу, зіткнення) і раніше
      // це змушувало напрямок перемикатись частіше, ніж насправді треба.
      const MIN_TURN_SPEED = 4; // px/s - мертва зона, щоб дрібний шум не тригерив поворот
      const isMovingNow = Math.hypot(entry.smoothVx, entry.smoothVy) > MIN_TURN_SPEED;

      if (isMovingNow) {
        const desiredFacingLeft = entry.smoothVx > 0;

        let desiredDirClass = '';
        if (cfg.spriteFile && Math.abs(entry.smoothVy) > Math.abs(entry.smoothVx) * 1.2) {
          desiredDirClass = entry.smoothVy < 0 ? ' dir-up' : ' dir-down';
        }

        const directionChanged = desiredDirClass !== entry.renderDirClass ||
          (desiredDirClass === '' && desiredFacingLeft !== entry.renderFacingLeft);

        if (directionChanged && cfg.spriteFile) {
          entry.turningUntil = now + BALANCE.TURN_DURATION_MS;
          entry.pendingFacingLeft = desiredFacingLeft;
          entry.pendingDirClass = desiredDirClass;
          forceTurnPose = true;
        } else {
          entry.renderFacingLeft = desiredFacingLeft;
          entry.renderDirClass = desiredDirClass;
        }
        entry.lastDirUpdateAt = now;
      }
    }

const displayState = forceTurnPose ? 'idle' : state;
    const newClassName = `ball state-${displayState}${forceTurnPose ? '' : entry.renderDirClass}` +
      (cfg.spriteFile ? ' has-sprite' : '') +
      (SimulationEngine.getSelectedIds().has(b.id) ? ' selected' : '');

    if (entry.ball.className !== newClassName) entry.ball.className = newClassName;
    entry.wrap.classList.toggle('facing-left', !forceTurnPose && entry.renderFacingLeft);

    if (cfg.spriteFile) {
      // Використовуємо state замість displayState, щоб анімація не переривалася під час мікро-поворотів
      entry.ball.style.backgroundPosition = spriteFramePosition(state, forceTurnPose ? '' : entry.renderDirClass, now);
      entry.wrap.style.transform = `scale(${SimulationEngine.visualGrowthScale(b).toFixed(3)})`;
    }

    entry.label.textContent = `L${b.level} 🍖${formatValue(SimulationEngine.corpseYield(b))}`;
    entry.barFill.style.width = (frac * 100) + '%';
    entry.barFill.style.background = frac < 0.3 ? '#e74c3c' : frac < 0.6 ? '#f1c40f' : '#2ecc71';
  }

  for (const [id, entry] of ballDivs) {
    if (!seen.has(id)) {
      entry.wrap.remove();
      ballDivs.delete(id);
    }
  }
} // <--- ФУНКЦІЮ syncBalls УСПІШНО ЗАКРИТО ТУТ!

function syncFoods() {
  const seen = new Set();
  for (const f of SimulationEngine.getFoods()) {
    seen.add(f.id);
    let div = foodDivs.get(f.id);
    if (!div) {
      div = document.createElement('div');
      div.className = 'food ' + f.type;
      const isFrozen = !!f.frozenUntil && performance.now() < f.frozenUntil;
      if (f.type === 'meat') div.textContent = isFrozen ? '🧊🍖' : '🍖';
      else if (f.type === 'grass') div.textContent = isFrozen ? '🧊' + (f.symbol || '🌿') : (f.symbol || '🌿');
      game.appendChild(div);
      foodDivs.set(f.id, div);
    }
    // Scale food icons but cap growth to avoid huge sprites for large energy
    const BASE_FOOD_SIZE = 8;
    const MAX_FOOD_ICON = 96; // maximum width/height in px for any food icon
    let size;
    if (f.type === 'grass') {
      // grass scales a bit more but still capped
      size = BASE_FOOD_SIZE + Math.min(f.energy * 6, MAX_FOOD_ICON - BASE_FOOD_SIZE);
      size = Math.round(size * 1.4);
    } else {
      // meat: use gentler (log-like) growth so large 'value' doesn't explode icon size
      const energyFactor = Math.log1p(Math.max(0, f.energy)) * 12; // smooth growth
      size = BASE_FOOD_SIZE + Math.min(Math.round(energyFactor), MAX_FOOD_ICON - BASE_FOOD_SIZE);
    }
    div.style.width = size + 'px';
    div.style.height = size + 'px';
    div.style.left = f.x + 'px';
    div.style.top = f.y + 'px';
    if (f.type === 'meat' || f.type === 'grass') div.style.fontSize = Math.max(10, Math.round(size * 0.9)) + 'px';
  }
  for (const [id, div] of foodDivs) {
    if (!seen.has(id)) { div.remove(); foodDivs.delete(id); }
  }
}

function syncPoisons() {
  const seen = new Set();
  for (const p of SimulationEngine.getPoisons()) {
    seen.add(p.id);
    let div = poisonDivs.get(p.id);
    if (!div) {
      div = document.createElement('div');
      div.className = 'food poison';
      div.textContent = '☠️';
      div.style.width = '16px'; div.style.height = '16px';
      div.style.fontSize = '14px';
      game.appendChild(div);
      poisonDivs.set(p.id, div);
    }
    div.style.left = p.x + 'px'; div.style.top = p.y + 'px';
  }
  for (const [id, div] of poisonDivs) {
    if (!seen.has(id)) { div.remove(); poisonDivs.delete(id); }
  }
}

function updateHud() {
  const s = SimulationEngine.getStats();
  const counts = {};
  for (const b of SimulationEngine.getBalls()) {
    if (!b.alive) continue;
    counts[b.type] = (counts[b.type] || 0) + 1;
  }
  const lines = Object.keys(SPECIES).map(t =>
    `${t}: ${counts[t] || 0}/${SPECIES[t].cap}`
  );
  hud.innerHTML = `Kills: ${s.kills} | Deaths: ${s.deaths} | LevelUps: ${s.levelUps}<br>` +
                   lines.join(' &nbsp; ');
}

function buildLeaderboard() {
  const legend = document.getElementById('legend');
  const ICON = 28; // розмір іконки в px; кадр спрайта нативно 64x64
  const scale = ICON / 64;
  const rows = Object.keys(SPECIES).map(type => {
    const cfg = SPECIES[type];
    const top = SimulationEngine.getTopUnitBySpecies(type);
    // Іконка - статичний кадр (перша колонка) з 2-го ряду спрайта (вигляд
    // збоку, y=-64px у нативному масштабі), проскейлений під розмір іконки.
    const icon = cfg.spriteFile
      ? `<span class="legend-icon" style="width:${ICON}px;height:${ICON}px;` +
        `background-image:url('${cfg.spriteFile}');` +
        `background-size:${256 * scale}px ${192 * scale}px;` +
        `background-position:0px ${-64 * scale}px;"></span>`
      : `<span class="swatch" style="background:${cfg.color}"></span>`;
    if (!top) {
      return `<div class="legend-row legend-empty">${icon}—</div>`;
    }
    const c = SimulationEngine.ballCenter(top);
    return `<div class="legend-row" data-x="${c.cx}" data-y="${c.cy}" title="${cfg.label} - перейти до юніта">` +
      `${icon}L${top.level} 🍖${formatValue(SimulationEngine.corpseYield(top))}</div>`;
  });
  legend.innerHTML = `<b>Лідери за видами</b><hr style="border-color:#555;margin:4px 0">` + rows.join('');
}

// Делегування кліку - #legend не пересоздається, лише його innerHTML,
// тож достатньо один раз повісити слухача на сам контейнер.
document.getElementById('legend').addEventListener('click', (e) => {
  const row = e.target.closest('.legend-row[data-x]');
  if (!row) return;
  focusOnPosition(parseFloat(row.dataset.x), parseFloat(row.dataset.y));
});

let lastLeaderboardAt = 0;

function draw() {
  syncStructures();
  syncBalls();
  syncFoods();
  syncPoisons();
  updateHud();

  const now = performance.now();
  if (now - lastLeaderboardAt > 20000) {
    buildLeaderboard();
    lastLeaderboardAt = now;
  }
}

game.style.width = WIDTH + 'px';
game.style.height = HEIGHT + 'px';
buildLeaderboard();

export const Renderer = {
  draw,
  showAimLine,
  hideAimLine,
  game
};
