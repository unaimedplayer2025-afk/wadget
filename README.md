# WADGET: Chain of Ages

Third-person browser action game. **Wadget**, a small black alien with big glowing pink eyes, rides a huge dark walrus
wrapped in heavy chains through time portals. Hunt five rifts across **Storm Isle** (prehistoria), the **Iron Prairie** (1885),
**The Source Grid** (2199), and the **Void Arena** bonus, then destroy **THE OMEGA STEER** — which only appears in 2199.

Play: **https://unaimedplayer2025-afk.github.io/wadget/**  
or open `index.html` from any static web server (ES modules need http, not `file://`).

## Controls
| | Desktop | Phone / tablet |
|---|---|---|
| Move | WASD / arrows (camera-relative) | left-thumb virtual joystick |
| Look | mouse (click to lock pointer) or drag | drag on the right side |
| Jump | Space | JUMP |
| Dodge-roll | Shift (or C, right-click) | ROLL |
| Throw disc | Left click / F / J / Enter | DISC |
| Mute | M or the speaker button | speaker button |

Wadget throws a Rygar-style spinning spiked disc on a chain. It flies out, hits, and returns. He stays on the walrus the whole time.

Title screen: first input turns audio on and starts the intro theme, second input starts the game; the theme fades out and the gameplay track fades in.

URL flags: `?demo` autopilot, `?capture` (autopilot + externally stepped frames for recording), `?lowfx` (no bloom, lower res), `?hifx` (never auto-downgrade), `?fps` (fps readout), `?seed=` (reproducible runs).

## Eras
- **PRE / Storm Isle** — volcanic island, glowing green sea, rain, little killer zombie dinosaurs.
- **1885 / Iron Prairie** — Wild West mesas, a looping robot train, steampunk robot train bandits. (No Native American characters.)
- **2199 / The Source Grid** — Matrix-like green code rain, chrome cow terminators, tentacled sentinel drones. Home of the final boss, the Omega Steer.
- **BONUS / Void Arena** — a Quake 3-style floating stone arena in a starry void. Timed wave survival with jump pads to an upper platform, health and armor orbs. Falling off is the void. Lasts 60 seconds (shorter in `?demo`).

## Music
- **Title / intro:** `audio/title-theme.ogg` with an `audio/title-theme.mp3` fallback for Safari/iOS. Swap these two files to change the splash song. The game picks the format with `canPlayType`.
- **Gameplay:** `audio/gameplay.ogg` / `audio/gameplay.mp3` loops in every era, including the bonus, and crossfades with the title theme. An era may override this with `ERAS[k].music = 'audio/my-era'` (base path; the same ogg/mp3 picker applies).

## Custom map / bonus-round hook
Era key `9999` (`BONUS_KEY`) ships as the Void Arena survival round. To swap in another map or rules later, from the console or a small module:

```js
import { installCustomEra, BONUS_KEY } from './src/eras.js';
// or in the running game: __dbg.installCustomEra({ ... })

installCustomEra({
  name: 'MY MAP',
  year: 'BONUS',
  tagline: 'THE BONUS ROUND',
  layout: 'bonus',                   // or 'default'; add a builder in world.js for a new layout
  music: 'audio/bonus',              // base path; .ogg / .mp3 picked via canPlayType
  roster: { /* type: weight, must exist in ENEMY_TYPES */ },
  bonus: { type: 'survival', duration: 60, goal: 20 },
  build() { /* return { group, groundMat, layoutMat, edges, update } */ }
});
```

Add any new enemy types to `ENEMY_TYPES` in `src/main.js`. Collision layouts live in `src/world.js` (`useLayout`). Push extra boxes onto `colliders` if a custom map needs new collision.

## Code
- `src/eras.js` – **ERAS table** (year, palette, fog, sky, lights, enemy roster, layout, music hook, quips, props builder, bonus rules). Add a year by adding an entry.
- `src/main.js` – game loop, hero (Wadget on the walrus), disc + chain, camera, input, enemy registry (`ENEMY_TYPES`) and AI, portals, warp tunnel, boss, HUD, title scene, demo autopilot, gameplay music fade.
- `src/models.js` – primitive/low-poly models (Wadget + walrus, disc, zombie dinos, train bandits, cow terminators, Matrix sentinels, Omega Steer).
- `src/world.js` – arena layouts (default shared arena + bonus Void Arena), AABB colliders, jump pads, portal spots, collision, sky dome, autopilot nav.
- `src/audio.js` – WebAudio SFX + title theme (`audio/title-theme.{ogg,mp3}`).
- `vendor/three` – Three.js r170 (MIT), vendored.

All characters and designs are original.
