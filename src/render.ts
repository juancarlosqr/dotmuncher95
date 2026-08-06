// Everything drawn on the canvas: maze, sprites, HUD, dialogs, title screen.

import {
  COLORS,
  DEATH_TIME,
  HUD_TOP_TILES,
  POWER_WARN_TIME,
  TILE,
  VIRUS_COLORS,
  VIRUS_NAMES,
  VIRUS_TAGLINES,
} from './config';
import { VirusMode, type Virus } from './entities';
import { GameState, type Game } from './game';
import { Dir, Pickup, Tile, type Maze, type Vec } from './maze';
import { drawText } from './pixelfont';

/** 8x8 virus body, two frames so the legs scurry; eyes are painted on top. */
const VIRUS_FRAMES: readonly (readonly string[])[] = [
  ['.#.##.#.', '.######.', '########', '########', '########', '########', '#.####.#', '#.#..#.#'],
  ['#..##..#', '.######.', '########', '########', '########', '########', '.######.', '.#.##.#.'],
];
const VIRUS_PX = 2.5;

/** Where the pupil sits inside its 2x2 eye, per look direction. */
const PUPIL_OFFSET: Readonly<Record<Dir, Vec>> = {
  [Dir.None]: { x: 0.5, y: 0.5 },
  [Dir.Up]: { x: 0.5, y: 0 },
  [Dir.Down]: { x: 0.5, y: 1 },
  [Dir.Left]: { x: 0, y: 0.5 },
  [Dir.Right]: { x: 1, y: 0.5 },
};

const FACING_ANGLE: Readonly<Record<Dir, number>> = {
  [Dir.None]: 0,
  [Dir.Up]: 0,
  [Dir.Right]: Math.PI / 2,
  [Dir.Down]: Math.PI,
  [Dir.Left]: -Math.PI / 2,
};

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/** A 3.5" floppy, shutter forward, drawn around (cx, cy). */
export function drawFloppy(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  facing: Dir,
  anim: number,
  spin = 0,
  scale = 1,
): void {
  if (scale <= 0) return;
  const u = size / 16;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(FACING_ANGLE[facing] + spin);
  ctx.scale(scale, scale);
  ctx.translate(-8 * u, -8 * u);

  // body with the chamfered corner every floppy has
  ctx.fillStyle = COLORS.player;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(16 * u, 0);
  ctx.lineTo(16 * u, 13 * u);
  ctx.lineTo(13 * u, 16 * u);
  ctx.lineTo(0, 16 * u);
  ctx.closePath();
  ctx.fill();

  // metal shutter, with the read slot sliding back and forth as it moves
  ctx.fillStyle = COLORS.playerShutter;
  ctx.fillRect(3 * u, 0, 10 * u, 6 * u);
  const slide = (Math.sin(anim * 14) + 1) / 2;
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect((4 + slide * 6) * u, 1 * u, 2 * u, 4 * u);

  // label
  ctx.fillStyle = COLORS.playerLabel;
  ctx.fillRect(2 * u, 8 * u, 12 * u, 7 * u);
  ctx.fillStyle = '#9a9a9a';
  ctx.fillRect(3 * u, 10 * u, 8 * u, 1 * u);
  ctx.fillRect(3 * u, 12 * u, 6 * u, 1 * u);

  // write-protect notch
  ctx.fillStyle = '#0c0c0c';
  ctx.fillRect(14.5 * u, 14 * u, 1.5 * u, 2 * u);
  ctx.restore();
}

export function drawVirusSprite(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  body: string | null,
  frightened: boolean,
  frame = 0,
  look: Dir = Dir.None,
): void {
  const px = VIRUS_PX;
  const ox = cx - 4 * px;
  const oy = cy - 4 * px;
  const shape = VIRUS_FRAMES[frame % VIRUS_FRAMES.length];
  if (body) {
    ctx.fillStyle = body;
    for (let r = 0; r < 8; r++) {
      const row = shape[r];
      for (let c = 0; c < 8; c++) {
        if (row[c] === '#') ctx.fillRect(ox + c * px, oy + r * px, px, px);
      }
    }
  }
  if (frightened) {
    // pinprick eyes and a worried zigzag mouth
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ox + 2 * px, oy + 3 * px, px, px);
    ctx.fillRect(ox + 5 * px, oy + 3 * px, px, px);
    for (const c of [1, 3, 5]) ctx.fillRect(ox + c * px, oy + 5 * px, px, px);
    for (const c of [2, 4, 6]) ctx.fillRect(ox + c * px, oy + 6 * px, px, px);
    return;
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(ox + 1 * px, oy + 2 * px, 2 * px, 2 * px);
  ctx.fillRect(ox + 5 * px, oy + 2 * px, 2 * px, 2 * px);
  const pupil = PUPIL_OFFSET[look];
  ctx.fillStyle = '#000080';
  ctx.fillRect(ox + (1 + pupil.x) * px, oy + (2 + pupil.y) * px, px, px);
  ctx.fillRect(ox + (5 + pupil.x) * px, oy + (2 + pupil.y) * px, px, px);
}

export class Renderer {
  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    readonly width: number,
    readonly height: number,
  ) {}

  draw(game: Game, time: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = COLORS.floor;
    ctx.fillRect(0, 0, this.width, this.height);
    if (game.state === GameState.Title) {
      this.drawTitle(game, time);
      return;
    }

    this.drawHud(game);
    ctx.save();
    ctx.translate(0, HUD_TOP_TILES * TILE);
    const flash = game.state === GameState.LevelClear && Math.floor(time * 6) % 2 === 0;
    this.drawMaze(game.maze, time, flash);
    if (game.state !== GameState.Dying) {
      for (const v of game.viruses) this.drawVirus(v, game, time);
    }
    this.drawPlayer(game);
    if (game.popup) {
      const p = game.popup.pos;
      drawText(ctx, game.popup.text, (p.x + 0.5) * TILE, (p.y - 0.3) * TILE, 1, VIRUS_COLORS[1], 'center');
    }
    ctx.restore();

    switch (game.state) {
      case GameState.Ready:
        this.drawDialog('DOTMUNCHER', ['READY!']);
        break;
      case GameState.GameOver:
        this.drawDialog('FATAL ERROR', ['GAME OVER', `SCORE ${game.score}`]);
        break;
      case GameState.LevelClear:
        this.drawDialog('DOTMUNCHER', [`LEVEL ${game.levelNumber} CLEAR!`]);
        break;
      case GameState.Playing:
        if (game.paused) this.drawDialog('DOTMUNCHER', ['PAUSED', 'PRESS P TO RESUME']);
        break;
      default:
        break;
    }
  }

  private drawHud(game: Game): void {
    const ctx = this.ctx;
    const w = this.width;
    drawText(ctx, 'SCORE', 8, 6, 1, COLORS.dim);
    drawText(ctx, pad(game.score, 6), 8, 18, 2, COLORS.text);
    drawText(ctx, 'HI-SCORE', w / 2, 6, 1, COLORS.dim, 'center');
    drawText(ctx, pad(game.hiScore, 6), w / 2, 18, 2, COLORS.bit, 'center');
    drawText(ctx, 'LEVEL', w - 8, 6, 1, COLORS.dim, 'right');
    drawText(ctx, pad(game.levelNumber, 2), w - 8, 18, 2, COLORS.text, 'right');

    const by = (HUD_TOP_TILES + game.maze.rows) * TILE;
    for (let i = 0; i < game.lives; i++) drawFloppy(ctx, 16 + i * 20, by + 12, 14, Dir.Up, 0);
    drawText(ctx, `BITS LEFT ${game.maze.bitsLeft}`, w - 8, by + 8, 1, COLORS.dim, 'right');
  }

  private drawMaze(maze: Maze, time: number, flash: boolean): void {
    const ctx = this.ctx;
    const bevel = 3;
    const pulse = 8 + Math.round(Math.sin(time * 6) * 2);
    for (let y = 0; y < maze.rows; y++) {
      for (let x = 0; x < maze.cols; x++) {
        const px = x * TILE;
        const py = y * TILE;
        const t = maze.tileAt(x, y);
        if (t === Tile.Wall) {
          ctx.fillStyle = flash ? COLORS.wallFlash : COLORS.wall;
          ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = COLORS.wallLight;
          if (maze.tileAt(x, y - 1) !== Tile.Wall) ctx.fillRect(px, py, TILE, bevel);
          if (maze.tileAt(x - 1, y) !== Tile.Wall) ctx.fillRect(px, py, bevel, TILE);
          ctx.fillStyle = COLORS.wallDark;
          if (maze.tileAt(x, y + 1) !== Tile.Wall) ctx.fillRect(px, py + TILE - bevel, TILE, bevel);
          if (maze.tileAt(x + 1, y) !== Tile.Wall) ctx.fillRect(px + TILE - bevel, py, bevel, TILE);
          continue;
        }
        if (t === Tile.Door) {
          ctx.fillStyle = COLORS.door;
          ctx.fillRect(px, py + TILE / 2 - 2, TILE, 4);
          continue;
        }
        const pickup = maze.pickupAt(x, y);
        if (pickup === Pickup.Bit) {
          ctx.fillStyle = COLORS.bit;
          ctx.fillRect(px + TILE / 2 - 2, py + TILE / 2 - 2, 4, 4);
        } else if (pickup === Pickup.PowerBit) {
          ctx.fillStyle = COLORS.bit;
          ctx.fillRect(px + TILE / 2 - pulse / 2, py + TILE / 2 - pulse / 2, pulse, pulse);
          ctx.fillStyle = COLORS.floor;
          ctx.fillRect(px + TILE / 2 - 2, py + TILE / 2 - 2, 4, 4);
        }
      }
    }
  }

  /** Draw at a tile position, plus a mirrored copy when the entity is halfway through a tunnel. */
  private wrapped(maze: Maze, pos: Vec, paint: (px: number, py: number) => void): void {
    const px = (pos.x + 0.5) * TILE;
    const py = (pos.y + 0.5) * TILE;
    paint(px, py);
    if (pos.x < 1) paint(px + maze.cols * TILE, py);
    if (pos.x > maze.cols - 2) paint(px - maze.cols * TILE, py);
  }

  private drawPlayer(game: Game): void {
    const p = game.player;
    let spin = 0;
    let scale = 1;
    if (game.state === GameState.Dying) {
      const t = 1 - game.stateTimer / DEATH_TIME;
      spin = t * Math.PI * 6;
      scale = Math.max(0, 1 - t);
    }
    this.wrapped(game.maze, p.pos, (px, py) =>
      drawFloppy(this.ctx, px, py, TILE - 4, p.facing, p.anim, spin, scale),
    );
  }

  private drawVirus(v: Virus, game: Game, time: number): void {
    let body: string | null = VIRUS_COLORS[v.id];
    const frightened = v.mode === VirusMode.Frightened;
    if (frightened) {
      const warn = game.powerTimer < POWER_WARN_TIME && Math.floor(time * 8) % 2 === 0;
      body = warn ? COLORS.frightenedFlash : COLORS.frightened;
    } else if (v.mode === VirusMode.Eyes) {
      body = null;
    }
    const frame = Math.floor(v.anim * 8) % 2;
    this.wrapped(game.maze, v.pos, (px, py) => drawVirusSprite(this.ctx, px, py, body, frightened, frame, v.dir));
  }

  /** A little grey Windows-style message box over the middle of the maze. */
  private drawDialog(title: string, lines: string[]): void {
    const ctx = this.ctx;
    const w = 264;
    const h = 44 + lines.length * 22;
    const x = Math.round((this.width - w) / 2);
    const y = Math.round(HUD_TOP_TILES * TILE + (this.height - HUD_TOP_TILES * TILE) / 2 - h / 2);

    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, w, 2);
    ctx.fillRect(x, y, 2, h);
    ctx.fillStyle = '#404040';
    ctx.fillRect(x, y + h - 2, w, 2);
    ctx.fillRect(x + w - 2, y, 2, h);

    ctx.fillStyle = '#000080';
    ctx.fillRect(x + 4, y + 4, w - 8, 16);
    drawText(ctx, title, x + 8, y + 8, 1, '#ffffff');
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(x + w - 20, y + 6, 12, 12);
    drawText(ctx, 'X', x + w - 14, y + 8, 1, '#000000', 'center');

    lines.forEach((line, i) => {
      drawText(ctx, line, x + w / 2, y + 30 + i * 22, 2, '#000000', 'center');
    });
  }

  private drawTitle(game: Game, time: number): void {
    const ctx = this.ctx;
    const w = this.width;

    ctx.fillStyle = '#12121c';
    for (let y = 12; y < this.height; y += 24) {
      for (let x = 12; x < w; x += 24) ctx.fillRect(x, y, 2, 2);
    }

    drawText(ctx, 'DOTMUNCHER', w / 2 + 4, 66 + 4, 4, '#7a3800', 'center');
    drawText(ctx, 'DOTMUNCHER', w / 2, 66, 4, COLORS.bit, 'center');
    drawText(ctx, '95', w / 2 + 6, 110 + 6, 8, '#0a4a3a', 'center');
    drawText(ctx, '95', w / 2, 110, 8, VIRUS_COLORS[1], 'center');

    ctx.fillStyle = '#404040';
    ctx.fillRect(24, 186, w - 48, 2);
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(24, 188, w - 48, 2);

    drawText(ctx, 'STARRING', w / 2, 202, 1, COLORS.dim, 'center');
    for (let i = 0; i < VIRUS_COLORS.length; i++) {
      const y = 224 + i * 30;
      const bob = Math.round(Math.sin(time * 5 + i * 1.3) * 2);
      const frame = Math.floor(time * 4 + i) % 2;
      const look = i % 2 === 0 ? Dir.Left : Dir.Right;
      drawVirusSprite(ctx, 60, y + 10 + bob, VIRUS_COLORS[i], false, frame, look);
      drawText(ctx, VIRUS_NAMES[i], 90, y + 3, 2, VIRUS_COLORS[i]);
      drawText(ctx, VIRUS_TAGLINES[i], 190, y + 7, 1, '#d0d0d0');
    }
    const fy = 224 + VIRUS_COLORS.length * 30 + 6;
    drawFloppy(ctx, 60, fy + 10 + Math.round(Math.sin(time * 5) * 2), 20, Dir.Right, time);
    drawText(ctx, 'FLOPPY', 90, fy + 3, 2, '#7f9cff');
    drawText(ctx, 'THAT IS YOU. GRAB EVERY BIT.', 190, fy + 7, 1, '#d0d0d0');

    if (Math.floor(time * 2) % 2 === 0) {
      drawText(ctx, 'PRESS ENTER TO START', w / 2, 424, 2, COLORS.text, 'center');
    }
    drawText(ctx, 'ARROWS OR WASD TO MOVE - P TO PAUSE', w / 2, 462, 1, COLORS.dim, 'center');
    drawText(ctx, `HI-SCORE ${pad(game.hiScore, 6)}`, w / 2, 486, 1, COLORS.bit, 'center');
    drawText(ctx, 'A 1995-STYLE MAZE GAME. NO DISKS WERE HARMED.', w / 2, 546, 1, '#606060', 'center');
  }
}
