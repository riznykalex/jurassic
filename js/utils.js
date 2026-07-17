// js/utils.js
export const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function formatValue(n) {
  n = Math.max(0, Math.round(n));
  if (n < 1000) return String(n);
  let s = (n / 1000).toFixed(1).replace('.', ',');
  if (s.endsWith(',0')) s = s.slice(0, -2);
  return s + 'k';
}

export const GRASS_SYMBOLS = ['🍀', '☘️', '🌿', '🥦', '🌱', '🌾', '🍄', '🌻', '🌼', '🌳', '🌴'];

export const SPRITE_ROW_Y = { side: -64, up: 0, down: -128 };

export function spriteFramePosition(state, dirClass, now) {
  // У спокої (idle) - завжди беремо нижній ряд спрайта, незалежно від
  // того, куди юніт дивиться (dirClass ігнорується для цього стану).
  const rowY = state === 'idle'
    ? SPRITE_ROW_Y.down
    : dirClass === ' dir-up' ? SPRITE_ROW_Y.up
    : dirClass === ' dir-down' ? SPRITE_ROW_Y.down
    : SPRITE_ROW_Y.side;

  // Атака: імітуємо випад/укус швидшим циклом тих самих кадрів - помітно
  // відрізняється темпом від звичайної ходьби. Спокій - трохи повільніший
  // цикл, ніж ходьба, щоб виглядало як спокійне дихання/озирання, а не біг.
  const cycleMs = state === 'attack' ? 260 : state === 'idle' ? 900 : 600;

  // Усі три ряди (up/side/down) тепер мають по 4 кадри.
  const frameIdx = Math.floor((now % cycleMs) / (cycleMs / 4));
  return (-frameIdx * 64) + 'px ' + rowY + 'px';
}
