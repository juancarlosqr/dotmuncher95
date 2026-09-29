// DotMuncher 95 - tunables, palette, and level data.

export const TILE = 24;
export const HUD_TOP_TILES = 2;
export const HUD_BOTTOM_TILES = 1;
export const FIXED_DT = 1 / 60;
export const MAX_STEPS_PER_FRAME = 6;
export const ROM_ID = "A3E0";

export const START_LIVES = 3;
export const EXTRA_LIFE_AT = 12000;

// ---- movement
// Speeds are in tiles per second.
export const PLAYER_SPEED = 6.4;
export const VIRUS_SPEED = 5.4;
export const VIRUS_FRIGHT_SPEED = 3.2;
export const VIRUS_EYES_SPEED = 13;
export const TUNNEL_SLOWDOWN = 0.5;
export const LOOP_SPEEDUP = 0.5;

// ---- timing
// Timings in seconds.
export const POWER_TIME = 7;
export const POWER_WARN_TIME = 2.2;
export const SCATTER_TIME = 6;
export const CHASE_TIME = 22;
export const READY_TIME = 1.8;
export const DEATH_TIME = 1.3;
export const CLEAR_TIME = 2.2;
export const EAT_FREEZE_TIME = 0.4;
export const VIRUS_RELEASE_TIMES = [0, 2, 4.5, 7];
export const VIRUS_RESPAWN_DELAY = 1.2;

// How often each virus ignores its target and takes a random turn (0..1).
export const RANDOM_TURN_CHANCE = [0, 0.2, 0.6, 0.35];
// Which corner each virus retreats to while scattering: 0 TL, 1 TR, 2 BL, 3 BR.
export const SCATTER_CORNER = [1, 0, 2, 3];

export const SCORE_BIT = 10;
export const SCORE_POWER_BIT = 50;
export const SCORE_VIRUS = [200, 400, 800, 1500];

export const COLORS = {
  floor: '#000000',
  wall: '#8a8a8a',
  wallLight: '#dedede',
  wallDark: '#383838',
  wallFlash: '#e8e8e8',
  door: '#ff8ac8',
  bit: '#fff07a',
  text: '#ffffff',
  dim: '#a0a0a0',
  player: '#2a4bd7',
  playerShutter: '#c4c4c4',
  playerLabel: '#f4f4f4',
  frightened: '#2626a6',
  frightenedFlash: '#e6e6ff',
} as const;

export const VIRUS_COLORS = ['#ff4040', '#40ffb0', '#ff80e0', '#ffa640'];
export const VIRUS_NAMES = ['Trojan', 'Worm', 'Hopper', 'Spam'];
export const VIRUS_TAGLINES = ['HUNTS YOU DOWN', 'CUTS YOU OFF AT THE PASS', 'BOUNCES AROUND', 'CHASES FROM AFAR'];

/*
 * Level legend
 *   #  wall            .  bit            o  power bit
 *   P  player start    V  virus den      =  den door
 *   space: empty floor. Open cells on the left/right edge wrap around.
 */

export const LEVEL_1: string[] = [
  '###################',
  '#........#........#',
  '#.##.###.#.###.##.#',
  '#o##.###.#.###.##o#',
  '#.................#',
  '#.##.#.#####.#.##.#',
  '#....#...#...#....#',
  '####.###.#.###.####',
  '####.#.......#.####',
  '####.#.##=##.#.####',
  ' ......#VVV#...... ',
  '####.#.#####.#.####',
  '####.#.......#.####',
  '#........#........#',
  '#.##.###.#.###.##.#',
  '#o.#.....P.....#.o#',
  '##.#.#.#####.#.#.##',
  '#....#...#...#....#',
  '#.######.#.######.#',
  '#.................#',
  '###################',
];

export const LEVEL_2: string[] = [
  '###################',
  '#o.......#.......o#',
  '#.###.##.#.##.###.#',
  '#.#.............#.#',
  '#.#.##.##.##.##.#.#',
  '#......#...#......#',
  '####.#.#.#.#.#.####',
  '####.#.......#.####',
  '####.#.##=##.#.####',
  ' ....#.#VVV#.#.... ',
  '####.#.#####.#.####',
  ' ....#.......#.... ',
  '####.#.#####.#.####',
  '#........#........#',
  '#.###.##.#.##.###.#',
  '#...#....P....#...#',
  '###.#.#######.#.###',
  '#o..#.........#..o#',
  '#.#...#######...#.#',
  '#.................#',
  '###################',
];

export const LEVELS: string[][] = [LEVEL_1, LEVEL_2];
