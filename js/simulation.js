// js/simulation.js
import { SPECIES, BALANCE, WIDTH, HEIGHT } from './config.js';
import { dist, clamp, GRASS_SYMBOLS } from './utils.js';
import { EventBus, EVENTS } from './events.js';

function _checkNumeric(label, v, obj) {
  if (!Number.isFinite(v)) {
    console.warn('[NaN DETECT]', label, v, obj && obj.id != null ? `id=${obj.id}` : '', obj);
  }
}


let balls = [];
let foods = [];
let poisons = [];
let nextBallId = 0;
let nextFoodId = 0;
let nextStructureId = 0;
let selectedIds = new Set();
let stats = { kills: 0, deaths: 0, levelUps: 0 };
let structures = [];
export const BUILD_COST = 5;
const DESTROY_COST = BUILD_COST; // той самий кошт, що й побудова каменя
const STONE_RADIUS = 18;
const APPROACH_MARGIN = 12; // "стати поруч" для DESTROY - не впритул до центру, а в межах цього допуску за колізією
export const DROP_FOOD_THRESHOLD = 100;
export const DROP_FOOD_AMOUNT = 100;
const FROZEN_FOOD_DURATION_MS = 20000;
// --- AI-будівництво стін (tribe_bot) ---
const BOT_BUILD_CHANCE = 0.0008;      // ймовірність за тік почати стіну, коли вільний і має ресурс
const BOT_WALL_MIN_STONES = 2;
const BOT_WALL_MAX_STONES = 4;
const BOT_WALL_VALUE_RESERVE = 1.5;   // запас value має бути принаймні BUILD_COST * камені * цей множник
const BOT_WALL_CURVE_CHANCE = 0.5;    // шанс що стіна буде кривою, а не прямою
const BOT_WALL_CURVE_STEP = 0.35;     // радіан нахилу напрямку на кожен наступний камінь (крива стіна)

function xpForKill(winnerLevel, loserLevel) {
  const diff = loserLevel - winnerLevel;
  const multiplier = clamp(Math.pow(2, diff / 3), 0.05, 4.0);
  return BALANCE.XP_BASE * multiplier;
}

function speciesCount(type) {
  return balls.reduce((n, b) => n + (b.type === type && b.alive ? 1 : 0), 0);
}

function makeBall(type, x, y) {
  const cfg = SPECIES[type];
  return {
    id: nextBallId++,
    type,
    alive: true,
    x, y,
    level: 1,
    xp: 0,
    energy: cfg.baseEnergy,
    vx: 0, vy: 0,
    isMoving: false,
    manualTarget: null,
    manualUntil: 0,
    attackTargetId: null,
    lastPoisonAt: 0,
    idleUntil: 0,
    value: cfg.maxEnergyBase * BALANCE.SPAWN_VALUE_RATIO,
    lastEvadeXpAt: 0,
    knockbackUntil: 0,   // поки now < це - юніт відкинутий ударом і AI не керує ним
    knockbackVx: 0,
    knockbackVy: 0,
    lastCombatAt: 0,     // час останнього удару (нанесеного чи отриманого) - для затримки прокачки
    lastCounterXpAt: 0,  // кулдаун XP від контрудару - інакше нараховувалось щотіку (до 60р/с)
    lastSurvivalXpAt: 0,
    pendingAction: null,
    wallPlan: null, // { angle, curvature, remaining, nextX, nextY } - AI-план багатокаменевої стіни
    _tempAggressiveUntil: 0,
  };
}

function maxEnergy(ball) {
  const cfg = SPECIES[ball.type];
  const base = cfg.maxEnergyBase + (ball.level - 1) * BALANCE.LEVEL_ENERGY_GAIN;
  const valueBonus = Math.min(base * 0.5, ball.value * BALANCE.VALUE_TO_ENERGY_FACTOR);
  return base + valueBonus;
}

function corpseYield(ball) {
  return ball.value * BALANCE.CORPSE_ENERGY_RATIO;
}

function visualGrowthScale(ball) {
  const SIZE_BOOST = 1.13;
  const levelGrowth = 1 + (ball.level - 1) * 0.06;
  return Math.min(levelGrowth, 1.5) * SIZE_BOOST;
}

function ballSize(ball) {
  const cfg = SPECIES[ball.type];
  if (cfg.spriteFile) {
    return cfg.spriteFrameSize || 64;
  }
  const size = cfg.sizeBase + ball.energy * 2 + (ball.level - 1) * 1.5;
  return Math.min(size, cfg.sizeBase * 2.2);
}

function ballCenter(ball) {
  const s = ballSize(ball);
  return { cx: ball.x + s / 2, cy: ball.y + s / 2 };
}

function isFoodAvailable(food) {
  return !food.frozenUntil || performance.now() >= food.frozenUntil;
}

// === spawn functions ===
function spawnRandomBall(type) {
  if (speciesCount(type) >= SPECIES[type].cap) return null;
  const cfg = SPECIES[type];
  const s = cfg.spriteFile ? (cfg.spriteFrameSize || 64) : cfg.sizeBase;
  const x = Math.random() * (WIDTH - s);
  const y = Math.random() * (HEIGHT - s);
  const b = makeBall(type, x, y);
  _checkNumeric('init value', b.value, b);
  balls.push(b);
  return b;
}

function spawnFoodRandom() {
  const x = Math.random() * (WIDTH - 14);
  const y = Math.random() * (HEIGHT - 14);
  const baseChoices = [0.15, 0.25, 0.35];
  let en = baseChoices[Math.floor(Math.random() * baseChoices.length)];
  const type = Math.random() < BALANCE.MEAT_RATIO ? 'meat' : 'grass';
  if (type === 'grass') {
    en = en * (BALANCE.GRASS_ENERGY_MULTIPLIER || 1);
  }
  const symbol = type === 'grass' ? GRASS_SYMBOLS[Math.floor(Math.random() * GRASS_SYMBOLS.length)] : null;
  foods.push({ id: nextFoodId++, x, y, energy: en, type, symbol });
}

function spawnPoisonPlants() {
  while (poisons.length < BALANCE.POISON_COUNT) {
    poisons.push({
      id: nextFoodId++,
      x: Math.random() * (WIDTH - 16),
      y: Math.random() * (HEIGHT - 16),
    });
  }
}

function createStructure(x, y) {
  const structure = {
    id: nextStructureId++,
    x,
    y,
    radius: STONE_RADIUS,
    type: 'stone',
    frameIndex: Math.floor(Math.random() * 6),
  };
  structures.push(structure);
  return structure;
}

function findStructureAt(x, y, targetId = null) {
  return structures.find((structure) => {
    if (targetId != null && structure.id !== targetId) return false;
    return Math.hypot(structure.x - x, structure.y - y) < structure.radius + 8;
  });
}

function canPlaceStructure(x, y) {
  const radius = STONE_RADIUS;
  if (x < radius || x > WIDTH - radius || y < radius || y > HEIGHT - radius) return false;
  // Поріг мав бути не менший за суму радіусів обох каменів (structure.radius
  // + STONE_RADIUS), інакше два камені могли фізично накластись одне на
  // одного (з окремим +10 це давало лише 28 при потрібних 36).
  return !structures.some((structure) => Math.hypot(structure.x - x, structure.y - y) < structure.radius + STONE_RADIUS);
}

function resolveStructureCollisions(unit) {
  if (!unit.alive) return;
  const size = ballSize(unit);
  const radius = size / 2;
  const centerX = unit.x + radius;
  const centerY = unit.y + radius;
  let pushed = false;

  for (const structure of structures) {
    const dx = centerX - structure.x;
    const dy = centerY - structure.y;
    const distance = Math.hypot(dx, dy) || 1;
    if (distance < radius + structure.radius) {
      const nx = dx / distance;
      const ny = dy / distance;
      const overlap = radius + structure.radius - distance + 0.01;
      unit.x = clamp(unit.x + nx * overlap, 0, WIDTH - size);
      unit.y = clamp(unit.y + ny * overlap, 0, HEIGHT - size);
      unit.vx = 0;
      unit.vy = 0;
      unit.isMoving = false;
      pushed = true;
    }
  }

  if (pushed) {
    const maxStep = Math.max(1, size * 0.35);
    const newCenterX = unit.x + radius;
    const newCenterY = unit.y + radius;
    for (const structure of structures) {
      const dx = newCenterX - structure.x;
      const dy = newCenterY - structure.y;
      const distance = Math.hypot(dx, dy) || 1;
      if (distance < structure.radius + maxStep) {
        const nx = dx / distance;
        const ny = dy / distance;
        const overlap = structure.radius + maxStep - distance;
        unit.x = clamp(unit.x + nx * overlap, 0, WIDTH - size);
        unit.y = clamp(unit.y + ny * overlap, 0, HEIGHT - size);
      }
    }
  }
}

function executePendingAction(unit) {
  if (!unit.alive || !unit.pendingAction) return;
  const action = unit.pendingAction;
  unit.pendingAction = null;
  unit.manualTarget = null;
  unit.manualUntil = 0;
  unit.isMoving = false;
  unit.vx = 0;
  unit.vy = 0;

  switch (action.type) {
    case 'build': {
      if (unit.value < BUILD_COST || !canPlaceStructure(action.x, action.y)) return;
      unit.value = Math.max(0, unit.value - BUILD_COST);
      createStructure(action.x, action.y);
      break;
    }
    case 'build_at': {
      // Для стін-з-декількох-каменів (AI): будує саме там, де юніт
      // ФАКТИЧНО опинився (могла спрацювати колізія по дорозі), і, якщо це
      // частина плану стіни (wallPlan), рахує наступну точку ТОЧНО на межі
      // щойно поставленого каменя вздовж напрямку стіни - це гарантує
      // щільне прилягання без потреби вгадувати координати заздалегідь.
      if (unit.value < BUILD_COST) { unit.wallPlan = null; return; }
      const { cx, cy } = ballCenter(unit);
      if (!canPlaceStructure(cx, cy)) { unit.wallPlan = null; return; }
      unit.value = Math.max(0, unit.value - BUILD_COST);
      createStructure(cx, cy);
      if (unit.wallPlan) {
        unit.wallPlan.remaining -= 1;
        unit.wallPlan.angle += unit.wallPlan.curvature; // для кривих стін - нахил з кожним каменем
        if (unit.wallPlan.remaining > 0 && unit.value >= BUILD_COST) {
          const ur = ballSize(unit) / 2;
          // Точка рівно на межі "юніт впритул до щойно поставленого каменя"
          // вздовж нового кута - фізично досяжна (юніт і так туди впреться
          // через колізію), тож наступний камінь ляже щільно до цього.
          unit.wallPlan.nextX = cx + Math.cos(unit.wallPlan.angle) * (ur + STONE_RADIUS);
          unit.wallPlan.nextY = cy + Math.sin(unit.wallPlan.angle) * (ur + STONE_RADIUS);
        } else {
          unit.wallPlan = null; // стіна завершена (або скінчився ресурс)
        }
      }
      break;
    }
    case 'destroy': {
      const structure = findStructureAt(action.x, action.y, action.targetId);
      if (!structure || unit.value < DESTROY_COST) return;
      unit.value = Math.max(0, unit.value - DESTROY_COST);
      structures = structures.filter((item) => item.id !== structure.id);
      break;
    }
    case 'drop_food': {
      const dropAmount = action.amount ?? DROP_FOOD_AMOUNT;
      if (unit.value < dropAmount || dropAmount <= 0) return;
      unit.value = Math.max(0, unit.value - dropAmount);
      foods.push({
        id: nextFoodId++,
        x: action.x ?? unit.x + ballSize(unit) / 2,
        y: action.y ?? unit.y + ballSize(unit) / 2,
        energy: dropAmount,
        type: 'meat',
        frozenUntil: performance.now() + FROZEN_FOOD_DURATION_MS,
      });
      break;
    }
    case 'interact': {
      const food = foods.find((item) => item.id === action.foodId);
      if (!food) return;
      const { cx, cy } = ballCenter(unit);
      if (dist(cx, cy, food.x, food.y) > ballSize(unit) / 2 + 10) return;
      unit.energy = Math.min(maxEnergy(unit), unit.energy + food.energy);
      unit.value += food.energy;
      foods.splice(foods.indexOf(food), 1);
      break;
    }
  }
}

function queueAction(ids, action) {
  ids.forEach((id) => {
    const ball = balls.find((item) => item.id === id);
    if (!ball || !ball.alive || !SPECIES[ball.type].playerControllable) return;

    ball.attackTargetId = null;

    if (action.type === 'drop_food' || action.type === 'build') {
      ball.pendingAction = { ...action };
      executePendingAction(ball);
      return;
    }

    // destroy (і interact) - юніт мусить фізично підійти до цілі, тож ідемо
    // до РЕАЛЬНИХ координат структури/об'єкта, а не координат кліку (клік
    // міг бути на кілька px осторонь завдяки допуску влучання).
    let targetX = action.x, targetY = action.y;
    if (action.type === 'destroy') {
      const structure = structures.find((item) => item.id === action.targetId);
      if (!structure) return; // каменя вже нема (хтось інший зруйнував раніше)
      targetX = structure.x;
      targetY = structure.y;
    }

    ball.pendingAction = { ...action };
    ball.manualTarget = { x: targetX, y: targetY };
    ball.manualUntil = performance.now() + BALANCE.MANUAL_LOCK_MS;
  });
}

// === core logic functions ===
  function gainXp(ball, amount) {
    ball.xp += amount; // лише накопичення - саме підвищення рівня відкладене (applyLevelUps)
  }

  function applyLevelUps(ball, now) {
    // Прокачка (перетворення накопиченого XP на рівень + повне зцілення)
    // відбувається лише коли бою реально не було певний час - не досить
    // просто "стояти", бо юніт може стояти й водночас далі отримувати удари
    // впритул від нападника поруч. Кожен такий удар оновлює lastCombatAt,
    // тож перевірка нижче коректно блокує прокачку, поки бій справді триває.
    const safe = (now - ball.lastCombatAt > BALANCE.LEVEL_UP_SAFE_DELAY_MS);
    if (!safe) return;
    let cost = BALANCE.XP_LEVEL_UP_COST * ball.level;
    let leveled = false;
    while (ball.xp >= cost) {
      ball.xp -= cost;
      ball.level += 1;
      cost = BALANCE.XP_LEVEL_UP_COST * ball.level;
      leveled = true;
    }
    if (leveled) {
      ball.energy = maxEnergy(ball); // ріст рівня = повне відновлення
      stats.levelUps++;
    }
    return leveled;
  }
  function dropCorpse(ball) {
    const amount = corpseYield(ball);
    _checkNumeric('corpse amount', amount, ball);
    if (amount <= 0.05) return; // нічого не лишилось (напр. загинув від голоду з порожнім запасом)
    const { cx, cy } = ballCenter(ball);
    const parts = amount > 1.2 ? 2 : 1;
    const EDGE_MARGIN = 20; // щоб туша не впала за межу поля й не стала недосяжною
    for (let i = 0; i < parts; i++) {
      foods.push({
        id: nextFoodId++,
        x: clamp(cx + (Math.random() - 0.5) * 20, EDGE_MARGIN, WIDTH - EDGE_MARGIN),
        y: clamp(cy + (Math.random() - 0.5) * 20, EDGE_MARGIN, HEIGHT - EDGE_MARGIN),
        energy: amount / parts,
        type: 'meat',
      });
    }
  }
  function killBall(ball, killer) {
    ball.alive = false;
    dropCorpse(ball);
    stats.deaths++;
    if (killer) {
      gainXp(killer, xpForKill(killer.level, ball.level));
      killer.value += ball.value * BALANCE.KILL_VALUE_TRANSFER; // повноцінне вбивство - трофей від реальної value жертви
      _checkNumeric('killer.value after kill', killer.value, killer);
      stats.kills++;
    }
  }
  function alliesNearby(unit) {
    const { cx, cy } = ballCenter(unit);
    let count = 0;
    for (const o of balls) {
      if (o === unit || !o.alive || o.type !== unit.type) continue;
      const oc = ballCenter(o);
      if (dist(cx, cy, oc.cx, oc.cy) < BALANCE.GROUP_RADIUS) count++;
    }
    return count;
  }
  function resolveBite(attacker, prey, lethalRange, dt) {
    const nowBite = performance.now();
    attacker.lastCombatAt = nowBite;
    prey.lastCombatAt = nowBite;

    const allies = alliesNearby(prey);
    const attackerAllies = alliesNearby(attacker); // зграя нападників (напр. вовча зграя)

    // Нормалізація до "еталонних" 60 fps: раніше flow застосовувався один раз
    // за виклик незалежно від тривалості кадру, тож бій фактично прискорювався
    // на високих fps і сповільнювався на низьких. dtScale=1 відповідає 60fps.
    const dtScale = dt * 60;
    // груповий захист: чим більше союзників поруч жертви, тим менше шкоди їй
    // і тим більше шкоди отримує сам нападник (спільна відсіч)
    const defenseFactor = 1 / (1 + allies * BALANCE.GROUP_DEFENSE_REDUCTION);
    // груповий напад: зграя нападників завдає більше шкоди разом (напр. вовча зграя)
    const packAttackFactor = 1 + attackerAllies * BALANCE.PACK_ATTACK_BONUS;
    // Укус впритул без прикриття союзників - набагато небезпечніший, але це
    // МНОЖНИК шкоди, а не гарантоване вбивство: юніт із запасом energy може
    // пережити навіть такий удар, тоді як виснажений загине і від слабшого.
    const lethalBonus = (lethalRange && allies === 0) ? BALANCE.LETHAL_BITE_MULTIPLIER : 1;
    const flow = 0.10 * defenseFactor * packAttackFactor * lethalBonus * dtScale;
    prey.energy -= flow;
    prey.value = Math.max(0, prey.value - flow); // цінність переходить до нападника, а не дублюється
    _checkNumeric('prey.value after bite', prey.value, prey);
    attacker.energy = Math.min(maxEnergy(attacker), attacker.energy + flow * 0.85);
    attacker.value += flow * 0.85; // "вполював" - додається до накопиченої цінності
    _checkNumeric('attacker.value after bite', attacker.value, attacker);
    try { attacker._tempAggressiveUntil = performance.now() + (BALANCE.AGGRESSION_MS || 0); } catch (e) { attacker._tempAggressiveUntil = 0; }
    if (allies > 0) {
      attacker.energy -= BALANCE.GROUP_COUNTER_DAMAGE * allies * dtScale;
    }

    if (prey.energy <= 0) {
      killBall(prey, attacker);
    } else {
      const ac = ballCenter(attacker);
      const pc = ballCenter(prey);
      let kdx = pc.cx - ac.cx, kdy = pc.cy - ac.cy;
      const kd = Math.hypot(kdx, kdy) || 1;
      const knockForce = BALANCE.KNOCKBACK_FORCE * (lethalBonus > 1 ? BALANCE.KNOCKBACK_CRIT_MULTIPLIER : 1);
      const preyEnergyFrac = prey.energy / maxEnergy(prey);

      // Контрудар: жертва, що пережила укус і має достатньо сил, б'є у
      // відповідь. Це НЕ прив'язано до конкретного виду (не лише
      // трицератопс) - будь-хто (носоріг, мамонт, вовк, людина) відбивається,
      // а сила контрудару природно залежить від власної energy жертви.
      // Поки сил вистачає - юніт стоїть на місці й б'ється, а не відскакує.
      // ЛИШЕ коли жертва сама (allies===0): коли поруч є союзники, нападника
      // вже карає GROUP_COUNTER_DAMAGE (групова відсіч) - додавання ще й
      // індивідуального контрудару ПОВЕРХ неї робило будь-яке стадо
      // буквально непробивною фортецею (нападник гинув за частку секунди).
      if (allies === 0 && preyEnergyFrac > BALANCE.COUNTER_ATTACK_MIN_ENERGY_FRAC) {
        const counterDamage = flow * BALANCE.COUNTER_ATTACK_RATIO * preyEnergyFrac;
        attacker.energy -= counterDamage;
        _checkNumeric('attacker.energy after counter', attacker.energy, attacker);
        // Кулдаун обов'язковий: без нього це нараховувалось КОЖЕН тік поки
        // триває контакт (до 60 разів/секунду) - за пару секунд стійкого
        // бою назбирувалось на десяток рівнів. Той самий підхід, що й у
        // SURVIVAL_XP нижче (lastSurvivalXpAt/EVADE_XP_COOLDOWN_MS).
        if (nowBite - prey.lastCounterXpAt > BALANCE.EVADE_XP_COOLDOWN_MS) {
          gainXp(prey, xpForKill(prey.level, attacker.level) * BALANCE.COUNTER_XP_RATIO);
          prey.lastCounterXpAt = nowBite;
        }

        // Відчутний контрудар лякає нападника: той розриває атаку й
        // відлітає назад - незалежно від того, чи сама жертва при цьому
        // відкидається (нижче) чи спокійно стоїть і продовжує битися.
        if (counterDamage > maxEnergy(attacker) * BALANCE.COUNTER_SCARE_THRESHOLD) {
          attacker.attackTargetId = null;
          attacker.knockbackVx = -(kdx / kd) * knockForce;
          attacker.knockbackVy = -(kdy / kd) * knockForce;
          attacker.knockbackUntil = performance.now() + BALANCE.KNOCKBACK_DURATION_MS;
        }
      }

      // Відштовхування самої ЖЕРТВИ - тільки коли її життєвий рівень уже
      // підупав (нижче KNOCKBACK_ENERGY_THRESHOLD). Поки прей ще "може
      // битися", вона нікуди не відлітає й лишається в межах атаки -
      // раніше відскок спрацьовував на КОЖЕН удар, через що жертва миттєво
      // вилітала з дистанції й фізично не встигала завдати відповідь.
      if (preyEnergyFrac < BALANCE.KNOCKBACK_ENERGY_THRESHOLD) {
        prey.knockbackVx = (kdx / kd) * knockForce;
        prey.knockbackVy = (kdy / kd) * knockForce;
        prey.knockbackUntil = performance.now() + BALANCE.KNOCKBACK_DURATION_MS;
      }

      // ТРАВОЇДНІ/ВОВКИ ТЕЖ ПРОГРЕСУЮТЬ: пережив небезпечну атаку - отримав досвід,
      // за тією самою анти-фарм формулою (мало XP від слабкого нападника, багато - від сильного).
      // Кулдаун - інакше серія швидких укусів поспіль давала XP щоразу (це і
      // робило дрібних, часто покусаних істот типу вовка/леопарда занадто
      // швидкопрокачуваними - вони фактично фармили досвід власними ранами).
      const now = performance.now();
      if (now - prey.lastSurvivalXpAt > BALANCE.EVADE_XP_COOLDOWN_MS) {
        gainXp(prey, xpForKill(prey.level, attacker.level) * BALANCE.SURVIVAL_XP_RATIO);
        prey.lastSurvivalXpAt = now;
      }
    }

    if (attacker.energy <= 0) {
      // загинув від відсічі (контрудар жертви або групова оборона союзників) -
      // це "перемога" для жертви: саме вона отримує кредит за вбивство.
      killBall(attacker, prey);
    }
  }
  /* --- Плем'я: люди, що "бачать" одне одного через ланцюжок близькості --- */
  function humanClusters() {
    const humans = balls.filter(b => b.alive && SPECIES[b.type].tribal);
    const visited = new Set();
    const clusters = [];
    for (const start of humans) {
      if (visited.has(start.id)) continue;
      const queue = [start];
      const cluster = [];
      visited.add(start.id);
      while (queue.length) {
        const cur = queue.pop();
        cluster.push(cur);
        const cc = ballCenter(cur);
        for (const other of humans) {
          if (visited.has(other.id)) continue;
          const oc = ballCenter(other);
          if (dist(cc.cx, cc.cy, oc.cx, oc.cy) <= BALANCE.TRIBE_RADIUS) {
            visited.add(other.id);
            queue.push(other);
          }
        }
      }
      clusters.push(cluster);
    }
    return clusters;
  }


  function expandToClusters(ids) {
    // якщо серед ids є хоч одна людина з ланцюжка - додаємо УВЕСЬ ланцюжок
    const result = new Set(ids);
    for (const cluster of humanClusters()) {
      if (cluster.some(u => result.has(u.id))) {
        cluster.forEach(u => result.add(u.id));
      }
    }
    return result;
  }
  function shareTribeResources() {
    for (const cluster of humanClusters()) {
      if (cluster.length < 2) continue;
      const avg = cluster.reduce((s, u) => s + u.energy, 0) / cluster.length;
      for (const u of cluster) {
        u.energy += (avg - u.energy) * BALANCE.TRIBE_ENERGY_SHARE_RATE;
      }
    }
  }

  function setManualTarget(ball, x, y) {
    ball.attackTargetId = null; // звичайна команда руху скасовує попередній наказ атаки
    ball.manualTarget = { x, y };
    ball.manualUntil = performance.now() + BALANCE.MANUAL_LOCK_MS;
  }

  function setAttackTarget(ball, targetId) {
    ball.manualTarget = null;
    ball.manualUntil = 0; // щоб decideBehaviour виконувався щотіку й переслідував ціль
    ball.attackTargetId = targetId;
  }

// === SELECTION FUNCTIONS ===
function selectBallAt(mx, my) {
  console.log(`[selectBallAt] Checking at ${mx.toFixed(0)}, ${my.toFixed(0)}`);
  for (const b of balls) {
    if (!b.alive || !SPECIES[b.type].playerControllable) continue;
    
    const { cx, cy } = ballCenter(b);
    const size = ballSize(b);
    const radius = size / 2;
    const distance = dist(mx, my, cx, cy);
    
    if (distance < radius + 12) {
      console.log(`✓ FOUND: ${b.type} (id:${b.id}) dist=${distance.toFixed(1)}`);
      return b;
    }
  }
  console.log('✗ No unit found at click');
  return null;
}

function selectAnyBallAt(mx, my) {
  console.log(`[selectAnyBallAt] Checking enemy at ${mx.toFixed(0)}, ${my.toFixed(0)}`);
  for (const b of balls) {
    if (!b.alive) continue;
    const { cx, cy } = ballCenter(b);
    const radius = ballSize(b) / 2;
    const distance = dist(mx, my, cx, cy);
    
    if (distance < radius + 15) {
      console.log(`✓ TARGET FOUND: ${b.type} (id:${b.id})`);
      return b;
    }
  }
  console.log('✗ No target found');
  return null;
}

function selectBallsInRect(x1, y1, x2, y2) {
  const left = Math.min(x1, x2) - 8;
  const right = Math.max(x1, x2) + 8;
  const top = Math.min(y1, y2) - 8;
  const bottom = Math.max(y1, y2) + 8;

  console.log(`[selectBallsInRect] Rect: ${left.toFixed(0)},${top.toFixed(0)} → ${right.toFixed(0)},${bottom.toFixed(0)}`);

  const result = [];
  for (const b of balls) {
    if (!b.alive || !SPECIES[b.type].playerControllable) continue;
    const { cx, cy } = ballCenter(b);
    
    if (cx >= left && cx <= right && cy >= top && cy <= bottom) {
      result.push(b);
      console.log(`✓ Selected: ${b.type} at ${cx.toFixed(0)},${cy.toFixed(0)}`);
    }
  }
  console.log(`Total found in rect: ${result.length}`);
  return result;
}
  /* --- Автономна поведінка одного юніта --- */
  function decideBehaviour(unit, dt) {
    if (performance.now() < unit.knockbackUntil) return; // юніт летить від удару - нічого не вирішує

    const cfg = SPECIES[unit.type];
    const { cx, cy } = ballCenter(unit);
    const myEnergyFrac = unit.energy / maxEnergy(unit);

    // Колишні окремі стани idle/rest об'єднані в один: юніт просто "стоїть"
    // (isMoving=false, немає manualTarget) і завдяки цьому вже відновлює
    // energy (регенерація тепер у moveBall відбувається завжди в стані
    // спокою, не лише в спеціальному "режимі відпочинку"). Тут лишається
    // тільки поведінкове питання - ЧИ ВАРТО йому знову рухатись, поки energy
    // ще не набрала RESUME_THRESHOLD. Відповідь: ні, окрім реальної загрози.
    if (!unit.isMoving && !unit.manualTarget && myEnergyFrac < BALANCE.RESUME_THRESHOLD) {
      let nearest = null, nd = Infinity;
      for (const o of balls) {
        if (o === unit || !o.alive) continue;
        // Загроза - лише те, що дійсно сильніше (той самий критерій, що й
        // нижче в "не агресивних"). Раніше рахувався просто "найближчий
        // будь-хто" без фільтра - на людній карті поруч ЗАВЖДИ щось є, тож
        // відновлення переривалось одразу, ще до реального ефекту.
        const threatScore = maxEnergy(o) * o.level - maxEnergy(unit) * unit.level;
        if (threatScore <= 0.5) continue;
        const oc = ballCenter(o);
        const dd = dist(cx, cy, oc.cx, oc.cy);
        if (dd < nd) { nd = dd; nearest = o; }
      }
      if (!(nearest && nd < cfg.visionDanger)) {
        return; // немає реальної загрози - спокійно стоїмо й відновлюємось
      }
      // інакше - є загроза, падаємо далі в звичайну логіку (нижче є критична втеча)
    }

    // Якщо є незавершена дія (зараз - лише destroy, бо build/drop_food
    // виконуються миттєво), але шлях до неї перервався (напр. по дорозі
    // довелось зупинитись відновити сили - REST_THRESHOLD скидає
    // manualTarget) - відновлюємо рух до тієї ж цілі, коли energy вже
    // достатня (інакше pendingAction висіла б назавжди; а без гейту по
    // energy юніт миттєво знову впирався б у REST_THRESHOLD і смикався
    // туди-сюди).
    if (unit.pendingAction && !unit.manualTarget && myEnergyFrac >= BALANCE.RESUME_THRESHOLD && performance.now() >= unit.manualUntil) {
      const action = unit.pendingAction;
      let target = null;
      if (action.type === 'destroy') {
        const structure = structures.find((item) => item.id === action.targetId);
        target = structure ? { x: structure.x, y: structure.y } : null;
      } else if (action.type === 'interact') {
        target = { x: action.x, y: action.y };
      } else if (action.type === 'build_at' && unit.wallPlan) {
        target = { x: unit.wallPlan.nextX, y: unit.wallPlan.nextY };
      }
      if (target) {
        unit.manualTarget = target;
        unit.manualUntil = performance.now() + BALANCE.MANUAL_LOCK_MS;
      } else {
        unit.pendingAction = null; // ціль зникла (камінь уже хтось зруйнував)
        unit.wallPlan = null;
      }
      return;
    }

    // AI-будівництво стіни: якщо є активний план (щойно розпочатий, або
    // продовжується після попереднього каменя) і зараз нема куди йти -
    // прямуємо до наступної точки плану й ставимо pendingAction build_at.
    if (unit.wallPlan && !unit.manualTarget && !unit.pendingAction && unit.value >= BUILD_COST) {
      setManualTarget(unit, unit.wallPlan.nextX, unit.wallPlan.nextY);
      unit.pendingAction = { type: 'build_at' };
      return;
    }

    // AI-РІШЕННЯ почати стіну: періодично, коли юніт вільний і має чималий
    // запас value, з невеликою ймовірністю починає будувати лінію каменів.
    // Якщо поруч є реальна загроза - стіна лягає ЩИТОМ/ПАСТКОЮ між юнітом
    // і загрозою (перпендикулярно до напрямку на неї). Якщо загрози нема -
    // просто "сховище" в довільному напрямку біля поточного місця.
    if (cfg.canBuildWalls && !unit.wallPlan && !unit.manualTarget && !unit.pendingAction
        && !unit.attackTargetId && unit.isMoving === false
        && unit.value >= BUILD_COST * BOT_WALL_MIN_STONES * BOT_WALL_VALUE_RESERVE
        && Math.random() < BOT_BUILD_CHANCE) {
      let threatDx = null, threatDy = null, bestDist = Infinity;
      for (const o of balls) {
        if (o === unit || !o.alive) continue;
        const threatScore = maxEnergy(o) * o.level - maxEnergy(unit) * unit.level;
        if (threatScore <= 0.5) continue;
        const oc = ballCenter(o);
        const dd = dist(cx, cy, oc.cx, oc.cy);
        if (dd < cfg.visionDanger && dd < bestDist) { bestDist = dd; threatDx = oc.cx - cx; threatDy = oc.cy - cy; }
      }
      const angle = threatDx !== null
        ? Math.atan2(threatDy, threatDx) + Math.PI / 2 // перпендикулярно до загрози - щит упоперек шляху
        : Math.random() * Math.PI * 2; // немає загрози - просто сховище в довільний бік
      const stones = BOT_WALL_MIN_STONES + Math.floor(Math.random() * (BOT_WALL_MAX_STONES - BOT_WALL_MIN_STONES + 1));
      const curvature = Math.random() < BOT_WALL_CURVE_CHANCE
        ? (Math.random() < 0.5 ? 1 : -1) * BOT_WALL_CURVE_STEP
        : 0;
      unit.wallPlan = { angle, curvature, remaining: stones, nextX: cx, nextY: cy };
      return;
    }

    if ((unit.manualTarget || performance.now() < unit.manualUntil) && !unit.attackTargetId) return;

    // 1. Критична втеча (універсальна, при малому запасі енергії) -
    //    тікає геть від НАЙБЛИЖЧОГО живого об'єкта, незалежно від виду.
    //    ВИНЯТОК: юніти гравця (manualOnly) цього не роблять самі - гравець
    //    сам відповідає за їхню безпеку й мусить вивести їх з небезпеки вручну.
    if (myEnergyFrac < BALANCE.CRITICAL_FLEE_THRESHOLD && !cfg.manualOnly) {
      let nearest = null, nd = Infinity;
      for (const o of balls) {
        if (o === unit || !o.alive) continue;
        const oc = ballCenter(o);
        const dd = dist(cx, cy, oc.cx, oc.cy);
        if (dd < nd) { nd = dd; nearest = o; }
      }
      if (nearest && nd < cfg.visionDanger * 1.3) {
        const oc = ballCenter(nearest);
        const dx = cx - oc.cx, dy = cy - oc.cy, d = Math.hypot(dx, dy) || 1;
        unit.vx = dx / d * cfg.speed * BALANCE.SPEED_MULTIPLIER * BALANCE.CRITICAL_FLEE_CHANCE_BONUS;
        unit.vy = dy / d * cfg.speed * BALANCE.SPEED_MULTIPLIER * BALANCE.CRITICAL_FLEE_CHANCE_BONUS;
        unit.isMoving = true;
        return;
      }
    }

    // Наказ гравця "атакувати саме цю ціль" - переслідує її, навіть якщо вона
    // рухається, і атакує в упор. Працює навіть для manualOnly-юнітів, бо це
    // явна команда, а не самостійна ініціатива.
    if (unit.attackTargetId !== null) {
      const target = balls.find(b => b.id === unit.attackTargetId && b.alive);
      if (!target) {
        unit.attackTargetId = null; // ціль загинула/зникла - наказ виконано
      } else {
        const tc = ballCenter(target);
        const dx = tc.cx - cx, dy = tc.cy - cy, d = Math.hypot(dx, dy) || 1;
        const now = performance.now();
        const pursuitMul = (now < (unit._tempAggressiveUntil || 0)) ? (BALANCE.SPEED_MULTIPLIER * (BALANCE.AGGRESSION_SPEED_BONUS || 1)) : BALANCE.SPEED_MULTIPLIER;
        unit.vx = dx / d * cfg.speed * pursuitMul;
        unit.vy = dy / d * cfg.speed * pursuitMul;
        unit.isMoving = true;
        const rU = ballSize(unit) / 2, rT = ballSize(target) / 2;
        if (d < rU + rT) {
          resolveBite(unit, target, d <= rU, dt);
        }
        return;
      }
    }

    // 2. Превентивна втеча від сильнішого/більшого (не для агресивних видів)
    if (cfg.manualOnly) {
      // "маріонетковий" юніт: не шукає їжу/ціль самостійно, не блукає, але
      // якщо він проходить прямо по шматку їжі (за наказом гравця чи стоячи
      // на місці) - підбирає її пасивно, без окремого пошуку.
      for (const f of foods) {
        if (!isFoodAvailable(f)) continue;
        if (f.type !== 'meat') continue; // людина їсть лише м'ясо (diet: hunter)
        const dd = dist(cx, cy, f.x, f.y);
        if (dd < ballSize(unit) / 2 + 6) {
          unit.energy = Math.min(maxEnergy(unit), unit.energy + f.energy);
          unit.value += f.energy;
          _checkNumeric('manual pickup value', unit.value, unit);
          foods.splice(foods.indexOf(f), 1);
          break;
        }
      }
      unit.isMoving = false; unit.vx = 0; unit.vy = 0;
      return;
    }
    if (!cfg.aggressive) {
      let danger = null, dDist = Infinity;
      for (const o of balls) {
        if (o === unit || !o.alive) continue;
        const threatScore = maxEnergy(o) * o.level - maxEnergy(unit) * unit.level;
        if (threatScore > 0.5) {
          const oc = ballCenter(o);
          const dd = dist(cx, cy, oc.cx, oc.cy);
          if (dd < dDist) { dDist = dd; danger = o; }
        }
      }
      if (danger && dDist < cfg.visionDanger) {
        // "Сміливість у стаді": якщо поруч достатньо одноплемінників, стадна
        // тварина більше не тікає завчасно - лишається стояти. Якщо хижак
        // все ж наважиться напасти, groupdefense у resolveBite (контрудар
        // від союзників) уже сама покарає нападника - стадо фактично
        // "агресивніше" через готовність зустріти загрозу разом, а не втечею.
        if (cfg.herds && alliesNearby(unit) >= BALANCE.HERD_BRAVERY_MIN_ALLIES) {
          // не тікаємо - переходимо до пошуку їжі/блукання нижче як звичайно
        } else {
        const oc = ballCenter(danger);
        const dx = cx - oc.cx, dy = cy - oc.cy, d = Math.hypot(dx, dy) || 1;
        unit.vx = dx / d * cfg.speed * BALANCE.SPEED_MULTIPLIER;
        unit.vy = dy / d * cfg.speed * BALANCE.SPEED_MULTIPLIER;
        unit.isMoving = true;
        // XP за "правильну" поведінку виживання - уникнув небезпеки ще ДО
        // того, як вона встигла вкусити. Раніше травоїдні (та інші швидкі,
        // обережні види) не отримували взагалі нічого за успішну втечу -
        // лише хижаки, які фактично билися, могли рости.
        const now = performance.now();
        if (now - unit.lastEvadeXpAt > BALANCE.EVADE_XP_COOLDOWN_MS) {
          gainXp(unit, xpForKill(unit.level, danger.level) * BALANCE.EVADE_XP_RATIO);
          unit.lastEvadeXpAt = now;
        }
        return;
        }
      }
    }

    // 3. Пошук їжі (трава для травоїдних, м'ясо для хижаків/людини)
    let closestF = null, minF = Infinity;
    for (const f of foods) {
      if (!isFoodAvailable(f)) continue;
      if (cfg.diet === 'herbivore' && f.type !== 'grass') continue;
      if ((cfg.diet === 'carnivore' || cfg.diet === 'hunter') && f.type !== 'meat') continue;
      const dd = dist(cx, cy, f.x, f.y);
      if (dd < minF) { minF = dd; closestF = f; }
    }
    if (closestF && minF < cfg.visionFood) {
      const dx = closestF.x - cx, dy = closestF.y - cy, d = Math.hypot(dx, dy) || 1;
      unit.vx = dx / d * cfg.speed * BALANCE.SPEED_MULTIPLIER;
      unit.vy = dy / d * cfg.speed * BALANCE.SPEED_MULTIPLIER;
      unit.isMoving = true;
      if (d < ballSize(unit) / 2 + 6) {
        unit.energy = Math.min(maxEnergy(unit), unit.energy + closestF.energy);
        unit.value += closestF.energy;
        _checkNumeric('pickup value', unit.value, unit);
        foods.splice(foods.indexOf(closestF), 1);
      }
      return;
    }

    // 4. Полювання (хижаки й людина) - лише в межах visionPrey, з обмеженням
    //    trophicWeight: дрібний хижак (вовк/тигр/леопард/людина) не може повноцінно
    //    полювати на апекс-вид (хижий динозавр) лише через прокачку рівнями -
    //    хіба що жертва вже критично поранена (добивання, а не полювання).
    if (cfg.diet === 'carnivore' || cfg.diet === 'hunter') {
      let prey = null, pDist = Infinity;
      for (const o of balls) {
        if (o === unit || !o.alive || o.type === unit.type) continue; // свій вид - не їжа
        const preyCfg = SPECIES[o.type];
        const preyFrac = o.energy / maxEnergy(o);
        const weightOk = preyCfg.trophicWeight <= cfg.trophicWeight + 1 ||
          (preyCfg.trophicWeight <= cfg.trophicWeight + 2 && preyFrac < BALANCE.CRITICAL_FLEE_THRESHOLD);
        if (!weightOk) continue;
        if (maxEnergy(o) * o.level < maxEnergy(unit) * unit.level * 0.9) {
          const oc = ballCenter(o);
          const dd = dist(cx, cy, oc.cx, oc.cy);
          if (dd < pDist) { pDist = dd; prey = o; }
        }
      }
      if (prey && pDist < cfg.visionPrey) {
        const pc = ballCenter(prey);
        const dx = pc.cx - cx, dy = pc.cy - cy, d = Math.hypot(dx, dy) || 1;
        const now = performance.now();
        const pursuitMul = (now < (unit._tempAggressiveUntil || 0)) ? (BALANCE.SPEED_MULTIPLIER * (BALANCE.AGGRESSION_SPEED_BONUS || 1)) : BALANCE.SPEED_MULTIPLIER;
        unit.vx = dx / d * cfg.speed * pursuitMul;
        unit.vy = dy / d * cfg.speed * pursuitMul;
        unit.isMoving = true;
        const rU = ballSize(unit) / 2, rP = ballSize(prey) / 2;
        if (d <= rU) {
          resolveBite(unit, prey, true, dt);
        } else if (d < rU + rP) {
          resolveBite(unit, prey, false, dt);
        }
        return;
      }
    }

    // 5. Спокій або блукання (для тварин - навіть при повній energy вони не
    //    рухаються постійно, а періодично просто стоять/пасуться на місці;
    //    людям спокій НЕ застосовується - їм потрібна активність, щоб знайти плем'я)
    if (!cfg.playerControllable && performance.now() < unit.idleUntil) {
      unit.isMoving = false; unit.vx = 0; unit.vy = 0;
      return;
    }
    if (!unit.isMoving || Math.random() < 0.01) {
      if (!cfg.playerControllable && Math.random() < BALANCE.IDLE_CHANCE) {
        unit.idleUntil = performance.now() +
          (BALANCE.IDLE_MIN_MS + Math.random() * (BALANCE.IDLE_MAX_MS - BALANCE.IDLE_MIN_MS));
        unit.isMoving = false; unit.vx = 0; unit.vy = 0;
        return;
      }
      let ang = Math.random() * Math.PI * 2;
      if (cfg.tribal || cfg.herds) {
        let nearestAlly = null, nd = Infinity;
        for (const o of balls) {
          if (o === unit || !o.alive || o.type !== unit.type) continue;
          const oc = ballCenter(o);
          const dd = dist(cx, cy, oc.cx, oc.cy);
          if (dd < nd) { nd = dd; nearestAlly = o; }
        }
        if (nearestAlly) {
          const oc = ballCenter(nearestAlly);
          const towardAng = Math.atan2(oc.cy - cy, oc.cx - cx);
          if (cfg.herds && nd < BALANCE.HERD_MIN_DISTANCE) {
            // занадто близько - відходимо (особистий простір у стаді)
            const awayAng = towardAng + Math.PI;
            ang = ang * (1 - BALANCE.HERD_COHESION_STRENGTH) + awayAng * BALANCE.HERD_COHESION_STRENGTH;
          } else if (cfg.herds && nd > BALANCE.HERD_MAX_DISTANCE) {
            ang = ang * (1 - BALANCE.HERD_COHESION_STRENGTH) + towardAng * BALANCE.HERD_COHESION_STRENGTH;
          } else if (cfg.tribal && nd > BALANCE.TRIBE_RADIUS * 0.5) {
            ang = ang * (1 - BALANCE.TRIBE_COHESION_STRENGTH) + towardAng * BALANCE.TRIBE_COHESION_STRENGTH;
          }
          // якщо в "комфортній зоні" (між MIN і MAX) - просто блукаємо випадково поруч
        }
      }

      // Відштовхування від країв карти - інакше юніт може довго "тертись" об
      // межу під час випадкового блукання, не знаючи, куди йти далі.
      const EDGE_MARGIN = 70;
      const s = ballSize(unit);
      let edgePushX = 0, edgePushY = 0;
      if (unit.x < EDGE_MARGIN) edgePushX = 1;
      else if (unit.x > WIDTH - s - EDGE_MARGIN) edgePushX = -1;
      if (unit.y < EDGE_MARGIN) edgePushY = 1;
      else if (unit.y > HEIGHT - s - EDGE_MARGIN) edgePushY = -1;
      if (edgePushX !== 0 || edgePushY !== 0) {
        const pushAng = Math.atan2(edgePushY, edgePushX);
        ang = ang * 0.25 + pushAng * 0.75; // біля краю - переважно тікаємо до центру
      }

      unit.vx = Math.cos(ang) * cfg.speed * BALANCE.SPEED_MULTIPLIER * 0.4;
      unit.vy = Math.sin(ang) * cfg.speed * BALANCE.SPEED_MULTIPLIER * 0.4;
      unit.isMoving = true;
    }
  }
  function moveBall(unit, dt) {
    if (!unit.alive) return;
    const cfg = SPECIES[unit.type];

    // Відкидання від удару - найвищий пріоритет: юніт летить по інерції і
    // ігнорує власні наміри (відпочинок/голод/ручний наказ) на час дії.
    // Однаково працює для травоїдних, хижаків і гравцівського племені.
    const now = performance.now();
    if (now < unit.knockbackUntil) {
      const s = ballSize(unit);
      const decay = clamp((unit.knockbackUntil - now) / BALANCE.KNOCKBACK_DURATION_MS, 0, 1);
      unit.vx = unit.knockbackVx * decay;
      unit.vy = unit.knockbackVy * decay;
      unit.x = clamp(unit.x + unit.vx * dt, 0, WIDTH - s);
      unit.y = clamp(unit.y + unit.vy * dt, 0, HEIGHT - s);
      resolveStructureCollisions(unit); // інакше сильний удар міг прокинути юніта наскрізь крізь стіну каменів
      unit.isMoving = true;  // щоб рендерер показав анімацію руху, не заморожений idle-кадр
      return;
    }

    // Голод: без запасу їжі (value) юніту нічим підживлювати energy - вона
    // поступово тане навіть у спокої, і юніт може загинути сам по собі,
    // не тільки від нападу.
    if (unit.value <= 0) {
      unit.energy -= BALANCE.STARVATION_DRAIN * dt;
      if (unit.energy <= 0) {
        killBall(unit, null);
        return;
      }
    }

    // Idle-регенерація: колишні окремі стани idle/rest об'єднані в один.
    // Юніт, що зараз просто стоїть (немає manualTarget і не рухається),
    // відновлює energy за рахунок накопиченої value - так само витрачаючи
    // запас їжі, а не отримуючи energy "з повітря". Голодний (value<=0)
    // просто не отримає regenAmount>0, і застрягне на низькій energy.
    if (!unit.manualTarget && !unit.isMoving) {
      const need = Math.max(0, maxEnergy(unit) - unit.energy);
      const regenAmount = Math.min(BALANCE.SLEEP_REGEN * dt * 60, need, unit.value);
      if (regenAmount > 0) {
        unit.energy += regenAmount;
        unit.value -= regenAmount;
        _checkNumeric('value after regen', unit.value, unit);
      }
    }
    if (unit.manualTarget) {
      const { cx, cy } = ballCenter(unit);
      const dx = unit.manualTarget.x - cx, dy = unit.manualTarget.y - cy;
      const d = Math.hypot(dx, dy);
      // Для destroy до центру каменя впритул не підійти - колізія
      // (resolveStructureCollisions) фізично зупинить юніта на межі
      // unitRadius+STONE_RADIUS раніше. Поріг прибуття має враховувати це,
      // інакше юніт ніколи не "дійде" (вічно тупцятиме на межі каменя).
      const arriveDist = (unit.pendingAction && unit.pendingAction.type === 'destroy')
        ? ballSize(unit) / 2 + STONE_RADIUS + APPROACH_MARGIN
        : 3;
      if (d < arriveDist) {
        unit.manualTarget = null;
        unit.manualUntil = 0;
        unit.isMoving = false;
        unit.vx = 0;
        unit.vy = 0;
        if (unit.pendingAction) {
          executePendingAction(unit);
        }
      } else {
        const k = d || 1;
        unit.vx = dx / k * cfg.speed * BALANCE.SPEED_MULTIPLIER;
        unit.vy = dy / k * cfg.speed * BALANCE.SPEED_MULTIPLIER;
        unit.isMoving = true; // БЕЗ цього рух міг "мовчки" ігноруватись, якщо юніт стояв
      }
    }
    if (unit.isMoving) {
      const stepx = unit.vx * dt, stepy = unit.vy * dt;
      unit.x += stepx; unit.y += stepy;
      const pixels = Math.hypot(stepx, stepy);
      unit.energy -= pixels * BALANCE.ENERGY_PER_PIXEL;
      const s = ballSize(unit);
      if (unit.energy <= maxEnergy(unit) * BALANCE.REST_THRESHOLD) {
        unit.energy = Math.max(0.05, unit.energy);
        unit.manualTarget = null; unit.manualUntil = 0; unit.isMoving = false;
        unit.vx = 0; unit.vy = 0; // без цього стара швидкість "застрягала" в юніті і
        // рендерер міг сприймати вже нерухомого юніта як такого, що йде -
        // анімація "заморожувалась" на walk-кадрі. isMoving=false тепер сам
        // по собі вмикає idle-регенерацію на наступному тіку (гілка вище).
      }
      const preClampX = unit.x, preClampY = unit.y;
      unit.x = clamp(unit.x, 0, WIDTH - s);
      unit.y = clamp(unit.y, 0, HEIGHT - s);
      // Якщо позицію справді обрізало межею - "відбиваємо" відповідну складову
      // швидкості. Без цього юніт із заблокованим напрямком (наприклад, у
      // критичній втечі чи переслідуванні цілі) міг нескінченно "тертись" об
      // край, не в змозі сам змінити рішення до наступного тіку AI.
      if (unit.x !== preClampX) unit.vx = -unit.vx * 0.6;
      if (unit.y !== preClampY) unit.vy = -unit.vy * 0.6;

      resolveStructureCollisions(unit);

      // manualOnly-юніти не мають окремого пошуку їжі (decideBehaviour), тож
      // підбираємо м'ясо "по дорозі", поки вони йдуть за наказом гравця
      if (cfg.manualOnly) {
        const { cx, cy } = ballCenter(unit);
        for (const f of foods) {
          if (!isFoodAvailable(f)) continue;
          if (f.type !== 'meat') continue;
          if (dist(cx, cy, f.x, f.y) < s / 2 + 6) {
            unit.energy = Math.min(maxEnergy(unit), unit.energy + f.energy);
              unit.value += f.energy;
              _checkNumeric('manual-moving pickup value', unit.value, unit);
            foods.splice(foods.indexOf(f), 1);
            break;
          }
        }
      }
    }
  }
  function applyPoison(unit) {
    if (!unit.alive) return;
    const now = performance.now();
    if (now - unit.lastPoisonAt < BALANCE.POISON_COOLDOWN_MS) return;
    const s = ballSize(unit);
    const { cx, cy } = ballCenter(unit);
    for (const p of poisons) {
      if (dist(cx, cy, p.x + 8, p.y + 8) < s / 2 + 8) {
        unit.energy -= BALANCE.POISON_DAMAGE;
        unit.lastPoisonAt = now;
        if (unit.energy <= 0) killBall(unit, null); // отрута не дає XP нікому
        break;
      }
    }
  }

function tick(dt) {
  for (const u of balls) if (u.alive) decideBehaviour(u, dt);
  for (const u of balls) moveBall(u, dt);
  for (const u of balls) applyPoison(u);
  shareTribeResources();

  const nowTick = performance.now();
  for (const u of balls) if (u.alive) applyLevelUps(u, nowTick);

  balls = balls.filter(b => b.alive || selectedIds.has(b.id));

  if (foods.length < BALANCE.MAX_FOOD && Math.random() < 0.12) spawnFoodRandom();
  spawnPoisonPlants();

  if (balls.length < BALANCE.MAX_TOTAL_BALLS) {
    for (const type in SPECIES) {
      if (Math.random() < SPECIES[type].spawnChance) spawnRandomBall(type);
    }
  }
}

function init() {
  for (let i = 0; i < 6; i++) spawnRandomBall('human');
  for (let i = 0; i < 6; i++) spawnRandomBall('tribe_bot');
  for (let i = 0; i < 6; i++) spawnRandomBall('wolf');
  spawnRandomBall('dino_predator');
  spawnRandomBall('dino_herbivore'); spawnRandomBall('dino_herbivore');
  spawnRandomBall('mammoth'); spawnRandomBall('rhino');
  spawnRandomBall('tiger'); spawnRandomBall('tiger');
  spawnRandomBall('leopard'); spawnRandomBall('leopard');
  for (let i = 0; i < 90; i++) spawnFoodRandom();
  spawnPoisonPlants();
}

// Підписки на події (CQRS - Commands)
EventBus.on(EVENTS.COMMAND_SELECT, ({ ids }) => {
  selectedIds = new Set(ids);
  EventBus.emit(EVENTS.SELECTION_CHANGED, selectedIds);
});

EventBus.on(EVENTS.COMMAND_MOVE, ({ ids, x, y }) => {
  console.log(`[SIMULATION] Moving ${ids.length} units to (${x.toFixed(0)}, ${y.toFixed(0)})`);
  const n = ids.length;
  ids.forEach((id, i) => {
    const ball = balls.find(b => b.id === id);
    if (!ball) return;
    const angle = (i / Math.max(1, n)) * Math.PI * 2;
    const spread = n > 1 ? 16 : 0;
    // Логіка формацій тепер тут, у симуляції!
    setManualTarget(ball, x + Math.cos(angle) * spread, y + Math.sin(angle) * spread);
  });
});

EventBus.on(EVENTS.COMMAND_ATTACK, ({ attackerIds, targetId }) => {
  console.log(`[SIMULATION] ${attackerIds.length} units attacking target ${targetId}`);
  for (const id of attackerIds) {
    const ball = balls.find(b => b.id === id);
    if (ball) setAttackTarget(ball, targetId);
  }
});


function unitScore(b) {
  // Комбінована оцінка "хто кращий": рівень важить більше (він дається важче
  // й дорожче з кожним кроком), але суттєвий запас їжі (value) теж рахується -
  // ситий юніт нижчого рівня може обійти повищий, але виснажений.
  return b.level * 20 + b.value;
}

function getTopUnitBySpecies(type) {
  let best = null;
  let bestScore = -Infinity;
  for (const b of balls) {
    if (!b.alive || b.type !== type) continue;
    const score = unitScore(b);
    if (score > bestScore) { best = b; bestScore = score; }
  }
  return best;
}

function hasPlayerUnits() {
  return balls.some((b) => b.alive && SPECIES[b.type].playerControllable);
}

export const SimulationEngine = {
  init,
  tick,

  getBalls: () => [...balls],
  getFoods: () => [...foods],
  getPoisons: () => [...poisons],
  getStructures: () => [...structures],
  getStats: () => ({ ...stats }),
  getSelectedIds: () => new Set(selectedIds),

  ballCenter,
  ballSize,
  maxEnergy,
  visualGrowthScale,
  corpseYield,

  selectBallAt,
  selectAnyBallAt,
  selectBallsInRect,
  queueAction,
  humanClusters,
  expandToClusters,
  getTopUnitBySpecies,
  hasPlayerUnits,
<<<<<<< HEAD
};
=======
};
>>>>>>> 7277f4e (Enhance species behavior and AI wall-building mechanics; unify idle and resting states for improved energy regeneration)
