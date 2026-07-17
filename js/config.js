// js/config.js
export const WIDTH = window.innerWidth * 2;
export const HEIGHT = window.innerHeight * 2;

export const SPECIES = {
  human: {
    label: 'Ваше плем\'я', color: '#4da6ff', diet: 'hunter', cap: 12, spawnChance: 0,
    baseEnergy: 8, maxEnergyBase: 11, speed: 135, sizeBase: 22, trophicWeight: 1,
    visionDanger: 220, visionFood: 260, visionPrey: 320, spriteFile: 'assets/tribe_1_4x3.png',
    aggressive: true, playerControllable: true, manualOnly: true, tribal: true,
    // manualOnly: не шукає їжу/здобич і не блукає самостійно - рухається ЛИШЕ за наказом гравця
  },
  tribe_bot: {
    label: 'Дике плем\'я', color: '#16a085', diet: 'hunter', cap: 12, spawnChance: 0.0015,
    baseEnergy: 6, maxEnergyBase: 8, speed: 105, sizeBase: 22, trophicWeight: 1,
    visionDanger: 220, visionFood: 260, visionPrey: 320, spriteFile: 'assets/tribe_2_4x3.png',
    aggressive: true, playerControllable: false, tribal: true,
    // повністю автономне: саме шукає їжу, полює, тримається купи (як людина раніше)
  },
  wolf: {
    label: 'Вовк', color: '#cfcfcf', diet: 'carnivore', cap: 20, spawnChance: 0.010,
    baseEnergy: 3, maxEnergyBase: 4, speed: 110, sizeBase: 16, trophicWeight: 1,
    visionDanger: 200, visionFood: 240, visionPrey: 260, spriteFile: 'assets/wolf_4x3.png',
    aggressive: false, playerControllable: false, herds: true, // мисливці зграєю
  },
  dino_predator: {
    label: 'Хижий динозавр', color: '#e74c3c', diet: 'carnivore', cap: 4, spawnChance: 0.0015,
    baseEnergy: 7, maxEnergyBase: 10, speed: 90, sizeBase: 48, trophicWeight: 3,
    visionDanger: 0, visionFood: 200, visionPrey: 260, spriteFile: 'assets/trex_4x3.png',
    aggressive: false, playerControllable: false, rare: true, // полює поодинці
  },
  dino_herbivore: {
    label: 'Трав. динозавр', color: '#f1c40f', diet: 'herbivore', cap: 9, spawnChance: 0.003,
    baseEnergy: 4, maxEnergyBase: 5, speed: 120, sizeBase: 22, trophicWeight: 2,
    visionDanger: 300, visionFood: 320, visionPrey: 0, spriteFile: 'assets/triceratops_4x3.png',
    aggressive: false, playerControllable: false, rare: true, herds: true, // пасеться стадом
  },
  mammoth: {
    label: 'Мамонт', color: '#a97142', diet: 'herbivore', cap: 6, spawnChance: 0.002,
    baseEnergy: 8, maxEnergyBase: 11, speed: 75, sizeBase: 36, trophicWeight: 2,
    visionDanger: 120, visionFood: 300, visionPrey: 0, spriteFile: 'assets/mamoth_4x3.png',
    aggressive: true, playerControllable: false, rare: true, herds: true, // не тікає превентивно
  },
  rhino: {
    label: 'Носоріг', color: '#7f8c8d', diet: 'herbivore', cap: 5, spawnChance: 0.004,
    baseEnergy: 6.5, maxEnergyBase: 9, speed: 85, sizeBase: 30, trophicWeight: 2,
    visionDanger: 120, visionFood: 250, visionPrey: 0, spriteFile: 'assets/rino_4x3.png',
    aggressive: true, playerControllable: false, rare: true, herds: true,
  },
  tiger: {
    label: 'Тигр', color: '#e67e22', diet: 'carnivore', cap: 6, spawnChance: 0.0018,
    baseEnergy: 5, maxEnergyBase: 7, speed: 100, sizeBase: 24, trophicWeight: 1,
    visionDanger: 150, visionFood: 200, visionPrey: 280, spriteFile: 'assets/tiger_4x3.png',
    aggressive: true, playerControllable: false, rare: true, // полює поодинці
  },
  leopard: {
    label: 'Леопард', color: '#f39c12', diet: 'carnivore', cap: 7, spawnChance: 0.002,
    baseEnergy: 3.5, maxEnergyBase: 5, speed: 145, sizeBase: 17, trophicWeight: 1,
    visionDanger: 400, visionFood: 500, visionPrey: 400, spriteFile: 'assets/leopard_4x3.png',
    aggressive: true, playerControllable: false, rare: true, // полює поодинці, засідка
  },
};

export const BALANCE = {
  ENERGY_PER_PIXEL: 0.0022,
  SPEED_MULTIPLIER: 0.2,       // загальне сповільнення - щоб анімація встигала показатись
  SLEEP_REGEN: 0.012,
  STARVATION_DRAIN: 0.05,      // energy/сек, яку юніт БЕЗ запасу їжі (value<=0) втрачає навіть у спокої
  MANUAL_LOCK_MS: 2500,
  MAX_TOTAL_BALLS: 74,
  MAX_FOOD: 150,
  MEAT_RATIO: 1 / 16,
  GRASS_ENERGY_MULTIPLIER: 2,
  POISON_COUNT: 5,
  POISON_DAMAGE: 0.35,
  POISON_COOLDOWN_MS: 1500,
  XP_BASE: 10,
  XP_LEVEL_UP_COST: 18,
  LEVEL_ENERGY_GAIN: 1.1,
  CRITICAL_FLEE_THRESHOLD: 0.30,
  CRITICAL_FLEE_CHANCE_BONUS: 1.6,
  CORPSE_ENERGY_RATIO: 0.6,     // яка частка накопиченої value юніта перетворюється на м'ясо туші після смерті
  SPAWN_VALUE_RATIO: 1.2,       // стартова харчова цінність (value) при спавні = maxEnergyBase * цей коефіцієнт
  KILL_VALUE_TRANSFER: 0.5,     // частка value жертви, яку вбивця отримує МИТТЄВО як трофей за смертельний удар
                                 // (додатково до туші - туша лишається в світі й доступна будь-кому, включно з союзниками)
  VALUE_TO_ENERGY_FACTOR: 0.02, // скільки максимальної energy дає кожна одиниця накопиченої "здобичі"
  // --- відпочинок під час руху (замість бігу до повного виснаження) ---
  REST_THRESHOLD: 0.50,        // якщо під час руху energy впала нижче 50% - зупинитись відпочити
  RESUME_THRESHOLD: 0.65,      // рухатись далі можна лише коли відновилось до 75%
  // --- групова оборона людей ---
  GROUP_RADIUS: 70,            // у межах цього радіусу союзники вважаються "поруч" (бій)
  HERD_BRAVERY_MIN_ALLIES: 2,  // стільки одноплемінників поруч скасовує превентивну втечу
  GROUP_COUNTER_DAMAGE: 0.6,  // шкоди нападнику за кожного союзника поруч
  GROUP_DEFENSE_REDUCTION: 0.4,// на стільки зменшується шкода жертві за кожного союзника
  PACK_ATTACK_BONUS: 0.35,     // наскільки зграя нападників (напр. вовки) підсилює шкоду разом
  LETHAL_BITE_MULTIPLIER: 3,   // множник шкоди для укусу впритул (замість гарантованого one-hit
                                // kill) - небезпечно, але виживання все одно залежить від energy
  KNOCKBACK_FORCE: 260,        // базова швидкість (px/с) відштовхування жертви від удару
  KNOCKBACK_CRIT_MULTIPLIER: 1.6, // додатковий множник сили для "впритул"-удару (lethalBonus)
  KNOCKBACK_DURATION_MS: 220,  // як довго діє відштовхування і AI-юніт не контролює рух
  KNOCKBACK_ENERGY_THRESHOLD: 0.35, // жертву відкидає лише коли energy впала нижче цієї частки
  COUNTER_ATTACK_RATIO: 0.5,   // частка отриманого удару, яку жертва повертає нападнику у відповідь
  COUNTER_ATTACK_MIN_ENERGY_FRAC: 0.15, // жертва надто виснажена (менше цієї частки energy) - контрудару не буде
  COUNTER_XP_RATIO: 0.25,      // бонусний XP за вдалий контрудар
  COUNTER_SCARE_THRESHOLD: 0.30, // якщо контрудар забрав більше цієї частки maxEnergy нападника - той лякається й відскакує
  SURVIVAL_XP_RATIO: 0.35,     // частка XP, яку жертва отримує за ПЕРЕЖИТУ (не смертельну) атаку
  EVADE_XP_RATIO: 0.15,        // частка XP за УСПІШНУ превентивну втечу (не дати себе вкусити)
  EVADE_XP_COOLDOWN_MS: 3000,  // щоб не фармити XP щокадру, тікаючи від того самого хижака

  // --- Плем'я: автоматичне групування людей, що "бачать" одне одного ---
  TRIBE_RADIUS: 90,            // якщо люди в межах цього радіусу - вони в одному ланцюжку/племені
  TRIBE_ENERGY_SHARE_RATE: 0.04, // частка різниці energy, що "перетікає" між членами племені за тік
  TRIBE_COHESION_STRENGTH: 0.5,  // наскільки сильно людина тягнеться до племені під час блукання

  // --- Стадо/зграя: травоїдні пасуться разом, вовки полюють зграєю ---
  HERD_MIN_DISTANCE: 22,       // ближче цього - розходяться (особистий простір)
  HERD_MAX_DISTANCE: 70,      // далі цього - підтягуються назад до стада
  HERD_COHESION_STRENGTH: 0.55,
  TURN_DURATION_MS: 220, // проміжна поза (обличчям/спиною) під час розвороту ліво<->право

  // --- Aggression when attacking ---
  AGGRESSION_MS: 6000,         // how long attacker remains 'aggressive' after attacking (ms)
  AGGRESSION_SPEED_BONUS: 1.25, // multiplier to speed while aggressive

  // --- Природний спокій тварин: не постійно в русі, навіть при повній energy ---
  IDLE_CHANCE: 0.4,            // шанс "зупинитись і постояти" замість руху при виборі дії
  IDLE_MIN_MS: 1500,
  IDLE_MAX_MS: 4500,
  // --- персистентні групи гравця (формуються спільною командою руху) ---
  COHESION_RADIUS: 90,           // якщо юніт групи далі за це від центру - повертається
  GROUP_SHARE_CONTRIBUTION: 0.3, // частка знайденої їжі йде у спільний запас групи
  GROUP_SHARE_REGEN: 0.03,       // скільки HP/тік член групи бере зі спільного запасу
};
