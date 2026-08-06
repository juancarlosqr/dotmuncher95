// Grid geometry, level parsing, collision, pickups, and path distances.

export interface Vec {
  x: number;
  y: number;
}

export enum Dir {
  None = 0,
  Up = 1,
  Down = 2,
  Left = 3,
  Right = 4,
}

export const DIRS: readonly Dir[] = [Dir.Up, Dir.Down, Dir.Left, Dir.Right];

export const DIR_VEC: Readonly<Record<Dir, Vec>> = {
  [Dir.None]: { x: 0, y: 0 },
  [Dir.Up]: { x: 0, y: -1 },
  [Dir.Down]: { x: 0, y: 1 },
  [Dir.Left]: { x: -1, y: 0 },
  [Dir.Right]: { x: 1, y: 0 },
};

export function opposite(d: Dir): Dir {
  switch (d) {
    case Dir.Up:
      return Dir.Down;
    case Dir.Down:
      return Dir.Up;
    case Dir.Left:
      return Dir.Right;
    case Dir.Right:
      return Dir.Left;
    default:
      return Dir.None;
  }
}

export function sameTile(a: Vec, b: Vec): boolean {
  return a.x === b.x && a.y === b.y;
}

export enum Tile {
  Floor = 0,
  Wall = 1,
  Door = 2,
}

export enum Pickup {
  None = 0,
  Bit = 1,
  PowerBit = 2,
}

export class Maze {
  readonly cols: number;
  readonly rows: number;
  readonly playerStart: Vec;
  readonly denSlots: Vec[];
  readonly door: Vec;
  /** The tile just outside the den door: where viruses emerge and eyes head back to. */
  readonly doorOut: Vec;
  /** The tile just inside the den door: where eaten viruses regenerate. */
  readonly denHome: Vec;
  /** Nearest open tile to each corner: top-left, top-right, bottom-left, bottom-right. */
  readonly corners: Vec[];
  bitsLeft = 0;

  private readonly tiles: Uint8Array;
  private readonly pickups: Uint8Array;

  constructor(layout: readonly string[]) {
    this.rows = layout.length;
    this.cols = this.rows === 0 ? 0 : layout[0].length;
    if (this.rows === 0 || this.cols === 0) throw new Error('level is empty');
    this.tiles = new Uint8Array(this.cols * this.rows);
    this.pickups = new Uint8Array(this.cols * this.rows);

    let playerStart: Vec | undefined;
    let door: Vec | undefined;
    const den: Vec[] = [];
    for (let y = 0; y < this.rows; y++) {
      const row = layout[y];
      if (row.length !== this.cols) {
        throw new Error(`level row ${y} is ${row.length} wide, expected ${this.cols}`);
      }
      for (let x = 0; x < this.cols; x++) {
        const i = this.index(x, y);
        switch (row[x]) {
          case '#':
            this.tiles[i] = Tile.Wall;
            break;
          case '=':
            this.tiles[i] = Tile.Door;
            door = { x, y };
            break;
          case '.':
            this.pickups[i] = Pickup.Bit;
            this.bitsLeft++;
            break;
          case 'o':
            this.pickups[i] = Pickup.PowerBit;
            this.bitsLeft++;
            break;
          case 'P':
            playerStart = { x, y };
            break;
          case 'V':
            den.push({ x, y });
            break;
          case ' ':
            break;
          default:
            throw new Error(`unknown level character '${row[x]}' at ${x},${y}`);
        }
      }
    }
    if (!playerStart) throw new Error('level has no player start (P)');
    if (!door) throw new Error('level has no den door (=)');
    if (den.length === 0) throw new Error('level has no den slots (V)');

    this.playerStart = playerStart;
    this.door = door;
    this.denSlots = den;
    this.doorOut = { x: door.x, y: door.y - 1 };
    this.denHome = { x: door.x, y: door.y + 1 };
    if (!this.canEnter(this.doorOut.x, this.doorOut.y) || !this.canEnter(this.denHome.x, this.denHome.y)) {
      throw new Error('den door must have open floor directly above and below it');
    }
    const c = this.cols - 1;
    const r = this.rows - 1;
    this.corners = [
      { x: 0, y: 0 },
      { x: c, y: 0 },
      { x: 0, y: r },
      { x: c, y: r },
    ].map((corner) => this.nearestOpen(corner, den));
  }

  index(x: number, y: number): number {
    return y * this.cols + x;
  }

  wrapX(x: number): number {
    return ((x % this.cols) + this.cols) % this.cols;
  }

  tileAt(x: number, y: number): Tile {
    if (y < 0 || y >= this.rows) return Tile.Wall;
    return this.tiles[this.index(this.wrapX(x), y)] as Tile;
  }

  canEnter(x: number, y: number, passDoor = false): boolean {
    const t = this.tileAt(x, y);
    return t === Tile.Floor || (passDoor && t === Tile.Door);
  }

  /** Open cells on the left or right edge are wrap-around tunnels. */
  isTunnel(x: number, y: number): boolean {
    return (x === 0 || x === this.cols - 1) && this.tileAt(x, y) === Tile.Floor;
  }

  pickupAt(x: number, y: number): Pickup {
    if (y < 0 || y >= this.rows) return Pickup.None;
    return this.pickups[this.index(this.wrapX(x), y)] as Pickup;
  }

  takePickup(x: number, y: number): Pickup {
    const p = this.pickupAt(x, y);
    if (p !== Pickup.None) {
      this.pickups[this.index(this.wrapX(x), y)] = Pickup.None;
      this.bitsLeft--;
    }
    return p;
  }

  neighbor(t: Vec, d: Dir): Vec {
    const v = DIR_VEC[d];
    return { x: this.wrapX(t.x + v.x), y: t.y + v.y };
  }

  openDirs(t: Vec, passDoor = false): Dir[] {
    const out: Dir[] = [];
    for (const d of DIRS) {
      const n = this.neighbor(t, d);
      if (this.canEnter(n.x, n.y, passDoor)) out.push(d);
    }
    return out;
  }

  /** Wrap-aware Manhattan distance. */
  tileDistance(a: Vec, b: Vec): number {
    let dx = Math.abs(a.x - b.x);
    dx = Math.min(dx, this.cols - dx);
    return dx + Math.abs(a.y - b.y);
  }

  /** Breadth-first walking distance from every tile to `target`; -1 where unreachable. */
  distanceMap(target: Vec, passDoor = false): Int16Array {
    const dist = new Int16Array(this.cols * this.rows).fill(-1);
    if (!this.canEnter(target.x, target.y, passDoor)) return dist;
    const queue: Vec[] = [target];
    dist[this.index(target.x, target.y)] = 0;
    for (let head = 0; head < queue.length; head++) {
      const cur = queue[head];
      const next = dist[this.index(cur.x, cur.y)] + 1;
      for (const d of DIRS) {
        const n = this.neighbor(cur, d);
        if (!this.canEnter(n.x, n.y, passDoor)) continue;
        const ni = this.index(n.x, n.y);
        if (dist[ni] !== -1) continue;
        dist[ni] = next;
        queue.push(n);
      }
    }
    return dist;
  }

  private nearestOpen(target: Vec, exclude: Vec[]): Vec {
    let best: Vec = this.playerStart;
    let bestD = Infinity;
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if (this.tiles[this.index(x, y)] !== Tile.Floor) continue;
        if (exclude.some((e) => e.x === x && e.y === y)) continue;
        const d = (x - target.x) ** 2 + (y - target.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { x, y };
        }
      }
    }
    return best;
  }
}
