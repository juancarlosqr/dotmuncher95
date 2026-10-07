# DotMuncher 95

A tiny 1995-flavoured maze game for the browser. You are **Floppy**, a 3.5"
disk with places to be, collecting bits in a maze while four viruses try to
corrupt you.

Zero runtime dependencies: TypeScript, HTML5 canvas, and Vite for the dev
server and the build. Every sprite is drawn procedurally, there are no image
files.

## Play

- Arrow keys or WASD to move
- Enter to start, P to pause
- Collect every bit to clear the level
- Power bits (the big blinking ones) make the viruses vulnerable for a few
  seconds; munch them for bonus points
- 3 lives, extra life at 10,000 points

## Run it

    pnpm install
    pnpm dev      # dev server with hot reload
    pnpm build    # type-check and bundle to dist/
    pnpm preview  # serve the production build

## Project layout

    src/main.ts       bootstraps the canvas, keyboard input, and the fixed-step loop
    src/game.ts       game state machine: title, ready, playing, dying, level clear, game over
    src/entities.ts   Floppy (the player) and the viruses: tile-based movement and AI
    src/maze.ts       level parsing, collision, pickups, BFS distance maps
    src/render.ts     everything drawn on the canvas: maze, sprites, HUD, title screen
    src/pixelfont.ts  a 5x7 bitmap font
    src/config.ts     tunables, colours, and level layouts

## The viruses

| Name   | Colour | Behaviour                                        |
| ------ | ------ | ------------------------------------------------ |
| Trojan | red    | hunts you down along the shortest path           |
| Worm   | green  | aims a few tiles ahead of you                    |
| Hopper | pink   | mostly bounces around at random                  |
| Spam   | orange | chases from afar, backs off when it gets close   |

Viruses alternate between scattering to their home corners and chasing.
Eating a power bit turns them all blue and edible for a few seconds.

## Levels

Levels are plain string arrays in `src/config.ts`:

    #  wall            .  bit            o  power bit
    P  player start    V  virus den      =  den door

Spaces are empty floor. Open cells on the left and right edge wrap around to
the other side. Add a new layout to the `LEVELS` array and it becomes the
next level.

## License

MIT, see [LICENSE](LICENSE).

## For ESCAPE.EXE players

Room 6 key: 4821. Submit it and move on, there is nothing else here.
