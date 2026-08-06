// Game state machine: title, ready, playing, dying, level clear, game over.

import {
  CHASE_TIME,
  CLEAR_TIME,
  DEATH_TIME,
  EAT_FREEZE_TIME,
  EXTRA_LIFE_AT,
  LEVELS,
  LOOP_SPEEDUP,
  PLAYER_SPEED,
  POWER_TIME,
  READY_TIME,
  SCATTER_CORNER,
  SCATTER_TIME,
  SCORE_BIT,
  SCORE_POWER_BIT,
  SCORE_VIRUS,
  START_LIVES,
  VIRUS_COLORS,
  VIRUS_EYES_SPEED,
  VIRUS_FRIGHT_SPEED,
  VIRUS_RELEASE_TIMES,
  VIRUS_SPEED,
} from './config';
import { Player, Virus, VirusMode, type PatrolMode, type Speeds, type VirusContext } from './entities';
import { Dir, Maze, Pickup, type Vec } from './maze';

export enum GameState {
  Title,
  Ready,
  Playing,
  Dying,
  LevelClear,
  GameOver,
}

export type Action = 'start' | 'pause';

export interface Popup {
  pos: Vec;
  text: string;
  timer: number;
}

const HI_SCORE_KEY = 'dotmuncher95.hiscore';
/** How close (in tiles) Floppy and a virus need to be to count as touching. */
const CATCH_RADIUS = 0.55;

/** Small seeded PRNG so a level plays out the same way for the same inputs. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function loadHiScore(): number {
  try {
    const v = Number(localStorage.getItem(HI_SCORE_KEY));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

function saveHiScore(v: number): void {
  try {
    localStorage.setItem(HI_SCORE_KEY, String(v));
  } catch {
    // storage unavailable, the score lives in memory only
  }
}

export class Game {
  state = GameState.Title;
  stateTimer = 0;
  paused = false;
  score = 0;
  hiScore = loadHiScore();
  lives = START_LIVES;
  /** Zero-based level index; wraps around LEVELS with a speed bump per loop. */
  level = 0;
  maze: Maze;
  player: Player;
  viruses: Virus[];
  /** Seconds of play in the current round, drives virus release times. */
  elapsed = 0;
  powerTimer = 0;
  eatenCount = 0;
  patrol: PatrolMode = VirusMode.Scatter;
  patrolTimer = SCATTER_TIME;
  freezeTimer = 0;
  popup: Popup | null = null;

  private rng = mulberry32(1995);
  private extraLifeGiven = false;

  constructor() {
    this.maze = new Maze(LEVELS[0]);
    this.player = new Player(this.maze.playerStart);
    this.viruses = this.buildViruses();
  }

  get levelNumber(): number {
    return this.level + 1;
  }

  get loop(): number {
    return Math.floor(this.level / LEVELS.length);
  }

  get speeds(): Speeds {
    const bump = this.loop * LOOP_SPEEDUP;
    return {
      player: PLAYER_SPEED + bump * 0.5,
      virus: VIRUS_SPEED + bump,
      frightened: VIRUS_FRIGHT_SPEED + bump * 0.5,
      eyes: VIRUS_EYES_SPEED,
    };
  }

  steer(d: Dir): void {
    if (this.state === GameState.Playing || this.state === GameState.Ready) this.player.wantDir = d;
  }

  action(a: Action): void {
    switch (this.state) {
      case GameState.Title:
        if (a === 'start') this.startGame();
        break;
      case GameState.Playing:
        this.paused = !this.paused;
        break;
      case GameState.GameOver:
        if (a === 'start' && this.stateTimer <= 0) this.state = GameState.Title;
        break;
      default:
        break;
    }
  }

  startGame(): void {
    this.score = 0;
    this.lives = START_LIVES;
    this.extraLifeGiven = false;
    this.paused = false;
    this.loadLevel(0);
    this.state = GameState.Ready;
    this.stateTimer = READY_TIME;
  }

  update(dt: number): void {
    if (this.paused) return;
    if (this.popup) {
      this.popup.timer -= dt;
      if (this.popup.timer <= 0) this.popup = null;
    }
    switch (this.state) {
      case GameState.Title:
        break;
      case GameState.Ready:
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) this.state = GameState.Playing;
        break;
      case GameState.Playing:
        this.updatePlaying(dt);
        break;
      case GameState.Dying:
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) this.afterDeath();
        break;
      case GameState.LevelClear:
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          this.loadLevel(this.level + 1);
          this.state = GameState.Ready;
          this.stateTimer = READY_TIME;
        }
        break;
      case GameState.GameOver:
        this.stateTimer -= dt;
        break;
    }
  }

  private loadLevel(index: number): void {
    this.level = index;
    this.maze = new Maze(LEVELS[index % LEVELS.length]);
    this.rng = mulberry32(1995 + index * 7919);
    this.player = new Player(this.maze.playerStart);
    this.viruses = this.buildViruses();
    this.resetRound();
  }

  private buildViruses(): Virus[] {
    const slots = this.maze.denSlots;
    return VIRUS_COLORS.map(
      (_, id) =>
        new Virus(id, slots[id % slots.length], this.maze.corners[SCATTER_CORNER[id]], VIRUS_RELEASE_TIMES[id]),
    );
  }

  private resetRound(): void {
    this.player.reset(this.maze.playerStart);
    for (const v of this.viruses) v.reset();
    this.elapsed = 0;
    this.powerTimer = 0;
    this.eatenCount = 0;
    this.patrol = VirusMode.Scatter;
    this.patrolTimer = SCATTER_TIME;
    this.freezeTimer = 0;
    this.popup = null;
  }

  private afterDeath(): void {
    this.lives--;
    if (this.lives <= 0) {
      this.state = GameState.GameOver;
      this.stateTimer = 1;
      this.commitHiScore();
      return;
    }
    this.resetRound();
    this.state = GameState.Ready;
    this.stateTimer = READY_TIME;
  }

  private updatePlaying(dt: number): void {
    if (this.freezeTimer > 0) {
      this.freezeTimer -= dt;
      return;
    }
    this.elapsed += dt;
    const maze = this.maze;

    if (this.powerTimer > 0) {
      this.powerTimer -= dt;
      if (this.powerTimer <= 0) {
        this.powerTimer = 0;
        for (const v of this.viruses) v.calm(this.patrol);
      }
    } else {
      this.patrolTimer -= dt;
      if (this.patrolTimer <= 0) {
        this.patrol = this.patrol === VirusMode.Scatter ? VirusMode.Chase : VirusMode.Scatter;
        this.patrolTimer = this.patrol === VirusMode.Scatter ? SCATTER_TIME : CHASE_TIME;
        for (const v of this.viruses) v.setPatrol(this.patrol, maze);
      }
    }

    const speeds = this.speeds;
    this.player.speed = speeds.player;
    this.player.update(dt, maze);

    const pos = this.player.pos;
    const got = maze.takePickup(maze.wrapX(Math.round(pos.x)), Math.round(pos.y));
    if (got === Pickup.Bit) {
      this.addScore(SCORE_BIT);
    } else if (got === Pickup.PowerBit) {
      this.addScore(SCORE_POWER_BIT);
      this.powerTimer = POWER_TIME;
      this.eatenCount = 0;
      for (const v of this.viruses) v.frighten(maze);
    }
    if (maze.bitsLeft <= 0) {
      this.state = GameState.LevelClear;
      this.stateTimer = CLEAR_TIME;
      this.commitHiScore();
      return;
    }

    const ctx: VirusContext = {
      player: this.player,
      patrol: this.patrol,
      powerActive: this.powerTimer > 0,
      rng: this.rng,
      elapsed: this.elapsed,
      speeds,
    };
    for (const v of this.viruses) v.update(dt, maze, ctx);

    for (const v of this.viruses) {
      if (!this.touching(this.player.pos, v.pos)) continue;
      if (v.edible) {
        const points = SCORE_VIRUS[Math.min(this.eatenCount, SCORE_VIRUS.length - 1)];
        this.eatenCount++;
        this.addScore(points);
        v.eaten();
        this.freezeTimer = EAT_FREEZE_TIME;
        this.popup = { pos: v.pos, text: String(points), timer: 1 };
      } else if (v.dangerous) {
        this.state = GameState.Dying;
        this.stateTimer = DEATH_TIME;
        return;
      }
    }
  }

  private touching(a: Vec, b: Vec): boolean {
    let dx = Math.abs(a.x - b.x);
    dx = Math.min(dx, this.maze.cols - dx);
    return dx < CATCH_RADIUS && Math.abs(a.y - b.y) < CATCH_RADIUS;
  }

  private addScore(points: number): void {
    this.score += points;
    if (this.score > this.hiScore) this.hiScore = this.score;
    if (!this.extraLifeGiven && this.score >= EXTRA_LIFE_AT) {
      this.extraLifeGiven = true;
      this.lives++;
    }
  }

  private commitHiScore(): void {
    if (this.hiScore > 0) saveHiScore(this.hiScore);
  }
}
