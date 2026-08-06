// Floppy (the player) and the viruses. Movement is tile-based: an entity sits
// on a tile and advances toward the next one, choosing a new direction each
// time it arrives. Rendering interpolates between tiles.

import { RANDOM_TURN_CHANCE, TUNNEL_SLOWDOWN, VIRUS_RESPAWN_DELAY } from './config';
import { Dir, DIR_VEC, opposite, sameTile, type Maze, type Vec } from './maze';

export interface Speeds {
  player: number;
  virus: number;
  frightened: number;
  eyes: number;
}

export abstract class Mover {
  tile: Vec;
  dir = Dir.None;
  /** 0..1 progress from `tile` toward the next tile in `dir`. */
  progress = 0;
  /** Tiles per second. */
  speed = 0;

  constructor(start: Vec) {
    this.tile = { ...start };
  }

  reset(start: Vec): void {
    this.tile = { ...start };
    this.dir = Dir.None;
    this.progress = 0;
  }

  /** Continuous position in tile units (may run past the grid edge in a tunnel). */
  get pos(): Vec {
    const v = DIR_VEC[this.dir];
    return { x: this.tile.x + v.x * this.progress, y: this.tile.y + v.y * this.progress };
  }

  reverse(maze: Maze): void {
    if (this.dir === Dir.None) return;
    const back = opposite(this.dir);
    if (this.progress > 0) {
      this.tile = maze.neighbor(this.tile, this.dir);
      this.progress = 1 - this.progress;
      this.dir = back;
    } else {
      const n = maze.neighbor(this.tile, back);
      if (maze.canEnter(n.x, n.y)) this.dir = back;
    }
  }

  /**
   * Move `speed * dt` tiles. `choose` is called on every tile arrival (and when
   * standing still) and must return a direction that is open from that tile,
   * or Dir.None to stop.
   */
  protected advance(dt: number, maze: Maze, choose: (tile: Vec) => Dir): void {
    if (this.dir === Dir.None) {
      this.dir = choose(this.tile);
      if (this.dir === Dir.None) return;
    }
    let budget = this.speed * dt;
    while (budget > 0 && this.dir !== Dir.None) {
      const need = 1 - this.progress;
      if (budget < need) {
        this.progress += budget;
        return;
      }
      budget -= need;
      this.tile = maze.neighbor(this.tile, this.dir);
      this.progress = 0;
      this.dir = choose(this.tile);
    }
  }
}

export class Player extends Mover {
  /** The direction the player wants to go; taken as soon as it is open. */
  wantDir = Dir.None;
  facing = Dir.Right;
  /** Seconds spent moving, drives the shutter animation. */
  anim = 0;

  override reset(start: Vec): void {
    super.reset(start);
    this.wantDir = Dir.None;
    this.facing = Dir.Right;
    this.anim = 0;
  }

  update(dt: number, maze: Maze): void {
    if (this.dir !== Dir.None && this.wantDir === opposite(this.dir)) this.reverse(maze);
    this.advance(dt, maze, (t) => this.pick(t, maze));
    if (this.dir !== Dir.None) {
      this.facing = this.dir;
      this.anim += dt;
    }
  }

  private pick(t: Vec, maze: Maze): Dir {
    if (this.wantDir !== Dir.None) {
      const n = maze.neighbor(t, this.wantDir);
      if (maze.canEnter(n.x, n.y)) return this.wantDir;
    }
    if (this.dir !== Dir.None) {
      const n = maze.neighbor(t, this.dir);
      if (maze.canEnter(n.x, n.y)) return this.dir;
    }
    return Dir.None;
  }
}

export enum VirusMode {
  InDen,
  Leaving,
  Scatter,
  Chase,
  Frightened,
  Eyes,
}

export type PatrolMode = VirusMode.Scatter | VirusMode.Chase;

export interface VirusContext {
  player: Player;
  patrol: PatrolMode;
  powerActive: boolean;
  rng: () => number;
  elapsed: number;
  speeds: Speeds;
}

export class Virus extends Mover {
  mode = VirusMode.InDen;
  anim = 0;
  private releaseAt: number;

  constructor(
    readonly id: number,
    readonly start: Vec,
    readonly scatterTarget: Vec,
    readonly releaseDelay: number,
  ) {
    super(start);
    this.releaseAt = releaseDelay;
  }

  override reset(start: Vec = this.start): void {
    super.reset(start);
    this.mode = VirusMode.InDen;
    this.releaseAt = this.releaseDelay;
    this.anim = 0;
  }

  get dangerous(): boolean {
    return this.mode === VirusMode.Scatter || this.mode === VirusMode.Chase || this.mode === VirusMode.Leaving;
  }

  get edible(): boolean {
    return this.mode === VirusMode.Frightened;
  }

  frighten(maze: Maze): void {
    if (this.mode === VirusMode.Scatter || this.mode === VirusMode.Chase || this.mode === VirusMode.Frightened) {
      this.mode = VirusMode.Frightened;
      this.reverse(maze);
    }
  }

  calm(patrol: PatrolMode): void {
    if (this.mode === VirusMode.Frightened) this.mode = patrol;
  }

  eaten(): void {
    this.mode = VirusMode.Eyes;
  }

  setPatrol(patrol: PatrolMode, maze: Maze): void {
    if (this.mode === VirusMode.Scatter || this.mode === VirusMode.Chase) {
      this.mode = patrol;
      this.reverse(maze);
    }
  }

  update(dt: number, maze: Maze, ctx: VirusContext): void {
    this.anim += dt;
    if (this.mode === VirusMode.InDen) {
      if (ctx.elapsed < this.releaseAt) return;
      this.mode = VirusMode.Leaving;
    }
    let speed =
      this.mode === VirusMode.Frightened
        ? ctx.speeds.frightened
        : this.mode === VirusMode.Eyes
          ? ctx.speeds.eyes
          : ctx.speeds.virus;
    if (this.mode !== VirusMode.Eyes && maze.isTunnel(this.tile.x, this.tile.y)) speed *= TUNNEL_SLOWDOWN;
    this.speed = speed;
    this.advance(dt, maze, (t) => this.decide(t, maze, ctx));
  }

  private decide(t: Vec, maze: Maze, ctx: VirusContext): Dir {
    if (this.mode === VirusMode.Leaving && sameTile(t, maze.doorOut)) {
      this.mode = ctx.powerActive ? VirusMode.Frightened : ctx.patrol;
    } else if (this.mode === VirusMode.Eyes && sameTile(t, maze.denHome)) {
      this.mode = VirusMode.InDen;
      this.releaseAt = ctx.elapsed + VIRUS_RESPAWN_DELAY;
      return Dir.None;
    }

    const passDoor = this.mode === VirusMode.Leaving || this.mode === VirusMode.Eyes;
    const options = maze.openDirs(t, passDoor);
    const back = opposite(this.dir);
    let cands = options.filter((d) => d !== back);
    if (cands.length === 0) cands = options;
    if (cands.length === 0) return Dir.None;
    if (cands.length === 1) return cands[0];

    switch (this.mode) {
      case VirusMode.Frightened:
        return this.random(cands, ctx);
      case VirusMode.Leaving:
        return this.toward(t, maze.doorOut, cands, maze, true);
      case VirusMode.Eyes:
        return this.toward(t, maze.denHome, cands, maze, true);
      case VirusMode.Scatter:
        return this.toward(t, this.scatterTarget, cands, maze, false);
      case VirusMode.Chase:
        if (ctx.rng() < (RANDOM_TURN_CHANCE[this.id] ?? 0)) return this.random(cands, ctx);
        return this.toward(t, this.chaseTarget(maze, ctx), cands, maze, false);
      default:
        return Dir.None;
    }
  }

  private random(cands: Dir[], ctx: VirusContext): Dir {
    return cands[Math.floor(ctx.rng() * cands.length)];
  }

  /** Pick the candidate direction whose next tile is closest (by walking distance) to `target`. */
  private toward(t: Vec, target: Vec, cands: Dir[], maze: Maze, passDoor: boolean): Dir {
    const dist = maze.distanceMap(target, passDoor);
    let best = cands[0];
    let bestD = Infinity;
    for (const d of cands) {
      const n = maze.neighbor(t, d);
      const raw = dist[maze.index(n.x, n.y)];
      const dd = raw < 0 ? 1e6 : raw;
      if (dd < bestD) {
        bestD = dd;
        best = d;
      }
    }
    return best;
  }

  private chaseTarget(maze: Maze, ctx: VirusContext): Vec {
    const p = ctx.player;
    let target: Vec;
    switch (this.id) {
      case 1: {
        // Worm aims four tiles ahead of Floppy to cut it off.
        const v = DIR_VEC[p.facing];
        target = { x: maze.wrapX(p.tile.x + v.x * 4), y: p.tile.y + v.y * 4 };
        break;
      }
      case 3:
        // Spam only commits when far away, then backs off to its corner.
        target = maze.tileDistance(this.tile, p.tile) > 8 ? p.tile : this.scatterTarget;
        break;
      default:
        target = p.tile;
    }
    return maze.canEnter(target.x, target.y) ? target : p.tile;
  }
}
