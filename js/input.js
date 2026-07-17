// js/input.js
import { SimulationEngine, BUILD_COST, DROP_FOOD_THRESHOLD, DROP_FOOD_AMOUNT } from './simulation.js';
import { Renderer } from './renderer.js';
import { EventBus, EVENTS } from './events.js';

const DRAG_THRESHOLD = 10;
const LONG_PRESS_MS = 400;

export function initInput() {
  const game = Renderer.game;
  const box = document.getElementById('selection-box');
  const container = game.parentElement || document.body;

  let dragging = false;
  let dragStartGame = null;
  let dragStartViewport = null;
  let isRightDragging = false;
  let rightDragStart = { x: 0, y: 0 };
  let scrollStart = { left: 0, top: 0 };
  let longPressTimer = null;
  let longPressTriggered = false;
  let currentMode = 'default';
  let contextMenu = null;
  let contextTargetUnit = null;

  function toGameCoords(e) {
    const rect = game.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  function setMode(mode) {
    currentMode = mode;
    const cursorMap = { default: 'default', build: 'crosshair', destroy: 'cell' };
    game.style.cursor = cursorMap[mode] || 'default';
    game.classList.remove('mode-default', 'mode-build', 'mode-destroy');
    game.classList.add(`mode-${mode}`);
  }

  function hideContextMenu() {
    if (contextMenu) {
      contextMenu.style.display = 'none';
    }
  }

  function getBuildableUnitIds(ids) {
    return ids.filter((id) => {
      const unit = SimulationEngine.getBalls().find((ball) => ball.id === id && ball.alive);
      return !!unit && unit.value >= BUILD_COST;
    });
  }

  function getDropFoodableUnitIds(ids) {
    return ids.filter((id) => {
      const unit = SimulationEngine.getBalls().find((ball) => ball.id === id && ball.alive);
      return !!unit && unit.value > DROP_FOOD_THRESHOLD;
    });
  }

  function showContextMenu(x, y, unit) {
    if (!contextMenu) {
      contextMenu = document.createElement('div');
      contextMenu.className = 'context-menu';
      game.appendChild(contextMenu);
    }

    const selectedIds = Array.from(SimulationEngine.getSelectedIds());
    const ids = selectedIds.length ? selectedIds : (unit ? [unit.id] : []);
    // build і destroy навмисно ділять один кошт (DESTROY_COST === BUILD_COST
    // у simulation.js) - тому одна й та сама перевірка коректно описує обидві кнопки.
    const canAffordStoneAction = getBuildableUnitIds(ids).length > 0;
    const canDropFood = getDropFoodableUnitIds(ids).length > 0;

    contextMenu.innerHTML = `
      <button data-action="build" class="context-icon build-icon" title="Побудувати камінь"></button>
      <button data-action="destroy" title="Розбити камінь">🔨</button>
      <button data-action="drop" title="Скинути їжу">🍖</button>
    `;
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
    contextMenu.style.display = 'block';

    const buildButton = contextMenu.querySelector('[data-action="build"]');
    if (buildButton) {
      buildButton.disabled = !canAffordStoneAction;
      buildButton.title = canAffordStoneAction ? 'Побудувати камінь' : 'Недостатньо їжі';
      buildButton.style.backgroundImage = "url('./assets/stones.png')";
      buildButton.style.backgroundRepeat = 'no-repeat';
      buildButton.style.backgroundSize = '168px 28px';
      buildButton.style.backgroundPosition = '0px 0px';
      buildButton.style.imageRendering = 'pixelated';
    }

    const destroyButton = contextMenu.querySelector('[data-action="destroy"]');
    if (destroyButton) {
      destroyButton.disabled = !canAffordStoneAction;
      destroyButton.title = canAffordStoneAction ? 'Розбити камінь' : 'Недостатньо їжі';
    }

    const dropButton = contextMenu.querySelector('[data-action="drop"]');
    if (dropButton) {
      dropButton.disabled = !canDropFood;
      dropButton.title = canDropFood ? 'Скинути їжу' : 'Потрібно більше 100 їжі';
    }

    const stopPropagation = (e) => e.stopPropagation();
    contextMenu.addEventListener('mousedown', stopPropagation);
    contextMenu.addEventListener('mouseup', stopPropagation);
    contextMenu.addEventListener('click', stopPropagation);

    contextMenu.querySelectorAll('button').forEach((button) => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        hideContextMenu();
        const selectedIds = Array.from(SimulationEngine.getSelectedIds());
        const ids = selectedIds.length ? selectedIds : (unit ? [unit.id] : []);
        if (button.dataset.action === 'build') {
          EventBus.emit(EVENTS.COMMAND_SELECT, { ids });
          buildStoneForIds(ids);
          setMode('default');
        } else if (button.dataset.action === 'destroy') {
          setMode('destroy');
          EventBus.emit(EVENTS.COMMAND_SELECT, { ids });
        } else if (button.dataset.action === 'drop') {
          SimulationEngine.queueAction(ids, { type: 'drop_food', x: unit.x + 20, y: unit.y + 20, amount: DROP_FOOD_AMOUNT });
        }
      });
    });
  }

  function getSelectedUnitIds() {
    const ids = Array.from(SimulationEngine.getSelectedIds());
    return ids.length ? ids : (contextTargetUnit ? [contextTargetUnit.id] : []);
  }

  function buildStoneForIds(ids) {
    getBuildableUnitIds(ids).forEach((id) => {
      const unit = SimulationEngine.getBalls().find((ball) => ball.id === id && ball.alive);
      if (unit) {
        const cx = unit.x + SimulationEngine.ballSize(unit) / 2;
        const cy = unit.y + SimulationEngine.ballSize(unit) / 2;
        SimulationEngine.queueAction([id], { type: 'build', x: cx, y: cy });
      }
    });
  }

  function handleModeClick(mx, my) {
    const ids = getSelectedUnitIds();
    if (currentMode === 'build') {
      buildStoneForIds(ids);
      setMode('default');
      return;
    }
    if (currentMode === 'destroy') {
      const structure = SimulationEngine.getStructures().find((item) => Math.hypot(item.x - mx, item.y - my) < item.radius + 8);
      if (structure) {
        SimulationEngine.queueAction(ids, { type: 'destroy', x: mx, y: my, targetId: structure.id });
      }
      setMode('default');
      return;
    }
  }

  game.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (currentMode !== 'default') {
      setMode('default');
      hideContextMenu();
    }
  });

  game.addEventListener('mousedown', (e) => {
    if (contextMenu && contextMenu.style.display === 'block' && e.target.closest('.context-menu')) {
      return;
    }
    if (e.button === 0) {
      dragging = false;
      dragStartGame = toGameCoords(e);
      dragStartViewport = { x: e.clientX, y: e.clientY };

      if (longPressTimer) clearTimeout(longPressTimer);
      longPressTriggered = false;
      const clickedUnit = SimulationEngine.selectBallAt(dragStartGame.x, dragStartGame.y);
      if (clickedUnit && clickedUnit.alive) {
        longPressTimer = window.setTimeout(() => {
          longPressTriggered = true;
          contextTargetUnit = clickedUnit;
          EventBus.emit(EVENTS.COMMAND_SELECT, { ids: [clickedUnit.id] });
          showContextMenu(e.clientX, e.clientY, clickedUnit);
        }, LONG_PRESS_MS);
      }
    } else if (e.button === 2) {
      isRightDragging = true;
      rightDragStart = { x: e.clientX, y: e.clientY };
      scrollStart = {
        left: window.scrollX || document.documentElement.scrollLeft || container.scrollLeft,
        top: window.scrollY || document.documentElement.scrollTop || container.scrollTop
      };
      if (currentMode !== 'default') {
        setMode('default');
        hideContextMenu();
      }
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (isRightDragging) {
      const dx = e.clientX - rightDragStart.x;
      const dy = e.clientY - rightDragStart.y;
      window.scrollTo(scrollStart.left - dx, scrollStart.top - dy);
      container.scrollLeft = scrollStart.left - dx;
      container.scrollTop = scrollStart.top - dy;
      return;
    }

    if (!dragStartGame) return;
    const curGame = toGameCoords(e);
    const moved = Math.hypot(curGame.x - dragStartGame.x, curGame.y - dragStartGame.y);

    if (moved > DRAG_THRESHOLD) {
      dragging = true;
      const left = Math.min(dragStartViewport.x, e.clientX);
      const top = Math.min(dragStartViewport.y, e.clientY);
      const w = Math.abs(e.clientX - dragStartViewport.x);
      const h = Math.abs(e.clientY - dragStartViewport.y);

      box.style.display = 'block';
      box.style.left = left + 'px';
      box.style.top = top + 'px';
      box.style.width = w + 'px';
      box.style.height = h + 'px';
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (e.button === 2) {
      if (isRightDragging) {
        const dx = Math.abs(e.clientX - rightDragStart.x);
        const dy = Math.abs(e.clientY - rightDragStart.y);
        if (dx < 5 && dy < 5) {
          EventBus.emit(EVENTS.COMMAND_SELECT, { ids: [] });
        }
        isRightDragging = false;
      }
      return;
    }

    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    if (longPressTriggered) {
      longPressTriggered = false;
      hideContextMenu();
      return;
    }

    if (e.button !== 0 || !dragStartGame) return;
    const gameEnd = toGameCoords(e);

    if (currentMode !== 'default') {
      handleModeClick(gameEnd.x, gameEnd.y);
      box.style.display = 'none';
      dragging = false;
      dragStartGame = null;
      dragStartViewport = null;
      return;
    }

    if (dragging) {
      const units = SimulationEngine.selectBallsInRect(dragStartGame.x, dragStartGame.y, gameEnd.x, gameEnd.y);
      const expanded = SimulationEngine.expandToClusters(units.map((u) => u.id));
      EventBus.emit(EVENTS.COMMAND_SELECT, { ids: Array.from(expanded) });
    } else {
      const clickedOwn = SimulationEngine.selectBallAt(gameEnd.x, gameEnd.y);
      const current = SimulationEngine.getSelectedIds();

      if (clickedOwn) {
        const preciseOnly = e.ctrlKey || e.metaKey;
        const idsToApply = preciseOnly
          ? [clickedOwn.id]
          : Array.from(SimulationEngine.expandToClusters([clickedOwn.id]));
        EventBus.emit(EVENTS.COMMAND_SELECT, { ids: idsToApply });
      } else {
        const clickedAny = SimulationEngine.selectAnyBallAt(gameEnd.x, gameEnd.y);
        if (clickedAny && current.size > 0) {
          EventBus.emit(EVENTS.COMMAND_ATTACK, { attackerIds: Array.from(current), targetId: clickedAny.id });
          EventBus.emit(EVENTS.COMMAND_SELECT, { ids: [] });
        } else if (current.size > 0) {
          EventBus.emit(EVENTS.COMMAND_MOVE, { ids: Array.from(current), x: gameEnd.x, y: gameEnd.y });
          EventBus.emit(EVENTS.COMMAND_SELECT, { ids: [] });
        }
      }
    }

    box.style.display = 'none';
    dragging = false;
    dragStartGame = null;
    dragStartViewport = null;
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && currentMode !== 'default') {
      setMode('default');
      hideContextMenu();
    }
  });
}