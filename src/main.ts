// Bootstraps the canvas, keyboard input, and the fixed-step game loop.

import { FIXED_DT, HUD_BOTTOM_TILES, HUD_TOP_TILES, LEVELS, MAX_STEPS_PER_FRAME, TILE } from './config';
import { Game, GameState } from './game';
import { Dir } from './maze';
import { Renderer } from './render';

const cols = Math.max(...LEVELS.map((level) => level[0].length));
const rows = Math.max(...LEVELS.map((level) => level.length));
const width = cols * TILE;
const height = (rows + HUD_TOP_TILES + HUD_BOTTOM_TILES) * TILE;

const mount = document.getElementById('screen');
if (!mount) throw new Error('missing #screen element');

const canvas = document.createElement('canvas');
const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
canvas.width = width * dpr;
canvas.height = height * dpr;
canvas.style.width = `${width}px`;
canvas.style.height = `${height}px`;
canvas.setAttribute('aria-label', 'DotMuncher 95 game screen');
mount.appendChild(canvas);

const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('2d canvas is not available');
ctx.scale(dpr, dpr);
ctx.imageSmoothingEnabled = false;

const game = new Game();
const renderer = new Renderer(ctx, width, height);

const KEY_DIRS: Readonly<Record<string, Dir>> = {
  ArrowUp: Dir.Up,
  KeyW: Dir.Up,
  ArrowDown: Dir.Down,
  KeyS: Dir.Down,
  ArrowLeft: Dir.Left,
  KeyA: Dir.Left,
  ArrowRight: Dir.Right,
  KeyD: Dir.Right,
};

window.addEventListener('keydown', (e) => {
  const dir = KEY_DIRS[e.code];
  if (dir !== undefined) {
    game.steer(dir);
    e.preventDefault();
    return;
  }
  if (e.code === 'Enter' || e.code === 'Space') {
    if (!e.repeat) game.action('start');
    e.preventDefault();
  } else if (e.code === 'KeyP' || e.code === 'Escape') {
    if (!e.repeat) game.action('pause');
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === GameState.Playing) game.paused = true;
  last = performance.now();
  accumulator = 0;
});

let last = performance.now();
let accumulator = 0;

function frame(now: number): void {
  let elapsed = (now - last) / 1000;
  last = now;
  if (elapsed > 0.25) elapsed = 0.25;
  accumulator += elapsed;

  let steps = 0;
  while (accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
    game.update(FIXED_DT);
    accumulator -= FIXED_DT;
    steps++;
  }
  if (steps === MAX_STEPS_PER_FRAME) accumulator = 0;

  renderer.draw(game, now / 1000);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
