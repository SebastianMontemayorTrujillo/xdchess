# Crab Chess — 3D, Piece Icons & Music Plan

Three upgrades to the current game, done in order from quickest win to biggest change:

1. **Piece icons in the minigames:** the fighters look like the chess pieces that are fighting
   (a Knight attacking a Queen shows ♞ vs ♛, not 🦀 vs 🦞).
2. **Music and sound effects.**
3. **3D chess:** the board and pieces rendered in 3D with Three.js. **The minigames stay 2D** (with the piece icons from step 1).

Nothing in the game rules (`src/game.js`), the AI (`src/ai/`) or the tests changes. All three upgrades
are about how the game **looks and sounds**, so a 3D game plays exactly like the current one.

---

## 1. Piece Icons in the Minigames

Today the minigames don't know which pieces are fighting: boxing shows 🦀 / 🦞, the water gun draws
plain circles and the coin is 🪙.

### Changes
- `main.js` → `fight()` already knows the attacker and defender. Pass them to the minigame:
  ```js
  game.run(overlay, { ai, pieces: { w: 'n', b: 'q' } }) // piece type per color
  ```
- Move the `GLYPH` table from `board.js` into a shared `src/pieces.js` so the board and the minigames use the same icons.
- **Boxing:** replace 🦀 / 🦞 with the two glyphs (white piece with outline, black piece solid, same style as the board).
- **Water Gun:** draw each piece's glyph on its circle.
- **Coin Toss:** Heads = the white piece's glyph, Tails = the black piece's glyph.
- Title cards already say "White ♞ attacks Black ♛", so no change there.

### Done when
Every minigame shows the two real pieces that are fighting, in both 2-player and vs-Computer modes.

---

## 2. Music and Sound

### Audio plan
| Moment | Sound |
|--------|-------|
| On the board | Calm background track (loops) |
| Roulette spin | Short ticking + "ding" when it stops |
| Minigame | Fast, energetic fight track (loops) |
| Piece moves | Soft wooden "tock" |
| Capture won / lost | Hit sound / "whoosh" |
| Boxing punch / block | Punch / thud |
| Water gun shot / hit | Splash / splat |
| Check | Warning sting |
| Game over | Victory or defeat jingle |

### Implementation
- New module `src/audio.js`, a small sound manager using the browser's Web Audio API (no library needed):
  - `playMusic('board' | 'fight')` crossfades between the two music tracks over ~1 s.
  - `playSfx('move')` etc. for short effects.
  - `setMuted(bool)` and a volume level, remembered in `localStorage`.
- Audio files live in `public/audio/` (`.mp3` or `.ogg`, small files, ~1–3 MB total).
- **Browsers block sound until the user clicks something.** Audio starts on the first click on the board
  or menu, which happens naturally because the first thing anyone does is click a piece.
- Add a 🔊 / 🔇 mute button next to "New game".

### Where the music comes from
**Decided: free tracks.** Use CC0 (public domain, no attribution needed) music and sounds, e.g. from
OpenGameArt.org or Kenney.nl audio packs. Only CC0 files, so there are no license conditions to track.
Write the source of each file in `public/audio/CREDITS.md` anyway, so the team can see where everything came from.

### Done when
Board music plays during the game, switches to fight music during minigames and back, every action
has a sound, and the mute button works and is remembered.

---

## 3. 3D

### Approach
- **Three.js** (`npm install three`), the standard 3D library for the browser. It works with Vite out of the box and needs no backend.
- **Keep the 2D board as a fallback** with a "2D / 3D" toggle. Useful for slow computers, for debugging,
  and as a safety net during a demo.
- The 3D board uses **the same interface** as the 2D one: `renderBoard(el, chess, { selected, targets, onSquare })`.
  `main.js` barely changes; it just picks which renderer to call.

### Piece models
Make the models **in code**, so there are no model files to find, license or load:
- **Pawn, Rook, Bishop, Queen, King:** `LatheGeometry`, which spins a 2D outline around an axis
  (like a wood-turning lathe, which is how real chess pieces are made). One small outline per piece.
- **Knight:** the only non-round piece. Extrude a horse-head silhouette (`ExtrudeGeometry`) and put it on a lathe base.
- Materials: white pieces = ivory, black pieces = dark wood/ebony, slight shine (`MeshStandardMaterial`).
- Later option: swap in nicer CC0 `.glb` models if the team finds a set it likes.

### 3D board scene
- 8×8 board of light/dark tiles on a wooden frame, soft lighting and shadows.
- Camera at an angle from White's side (the human's side in vs Computer). Drag to orbit, scroll to zoom,
  limited so the board can't be turned upside down. In 2-player mode the camera stays on White's side too;
  either player can orbit it if they want.
- **Clicking:** raycasting finds which square/piece is under the mouse and calls the same `onSquare(square)`.
- **Highlights**, matching the 2D version:
  - selected piece: glowing tile
  - legal moves: small discs on the tiles
  - captures: red ring
  - king in check: red glow under the king
  - hover: subtle tile highlight

### Animations
- Pieces **slide** to their new square (knights hop in an arc).
- **Before a minigame:** the camera zooms in on the two pieces facing each other, then the 2D minigame
  overlay (roulette + minigame) opens on top of the 3D board, exactly like today.
- **After a minigame:** the overlay closes, the loser shrinks/fades and falls off the board; the winner moves (or stays).
- The board waits for each animation to finish before the next turn. Animations return promises, so
  `fight()` and `computerTurn()` can simply `await` them.

### Minigames stay 2D
**Decided:** the minigames keep their current 2D look (plus the piece icons from section 1). They already
run in the HTML overlay, so they work on top of the 3D board with no changes.

### File layout
```
src/
├── pieces.js              # glyphs + piece names, shared by 2D, 3D and minigames
├── audio.js               # music + sound effects manager
├── board.js               # existing 2D board (kept as fallback)
├── board3d/
│   ├── scene.js           # renderer, camera, lights, orbit controls, resize
│   ├── models.js          # lathe/extrude piece geometry + materials
│   ├── board3d.js         # renderBoard() for 3D: tiles, pieces, highlights, raycast clicks
│   └── animate.js         # move / capture / camera tween helpers (promise-based)
└── minigames/             # stay 2D; only get the piece icons
public/
└── audio/                 # music + sfx files, CREDITS.md
```

---

## 4. Milestones

| # | Milestone | Done when | Status |
|---|-----------|-----------|--------|
| 1 | **Piece icons in minigames** (2D) | All minigames show the two real fighting pieces | ✅ Done |
| 2 | **Sound manager + mute button** | SFX play for moves, captures, punches, shots | ✅ Done |
| 3 | **Music** | Board/fight music crossfades; credits file added | ✅ Done |
| 4 | **3D board, static** | Board + piece models render; clicking and highlights work; 2D/3D toggle; vs Computer works in 3D | ✅ Done |
| 5 | **3D animations** | Pieces slide, captures animate, camera zooms into fights | ✅ Done |
| 6 | **Polish** | Smooth on a normal laptop (60 fps), works at small window sizes, loads fast | ✅ Done |

Milestones 1–3 are small and independent of 3D, so they make the game better right away.
Milestones 1–3 and 4–6 can be split between teammates: one person on icons + audio, one on 3D.

---

## 5. Testing
- Existing `npm test` (rules + AI) must keep passing at every milestone. None of this work should change them.
- 3D and audio are checked by playing: a short checklist per milestone (e.g. "click every piece type in 3D,
  capture in each minigame, toggle mute, switch 2D/3D mid-game").
- Keep the `?fen=` and `?game=` URL options working in 3D, so any minigame or position can be jumped to for testing.

## 6. Risks
| Risk | Plan |
|------|------|
| 3D too slow on some laptops | 2D/3D toggle; turn off shadows on slow devices |
| Knight model is hard to make look good | Start with a simple stylized horse head; swap in a CC0 model later if needed |
| Music licensing | Only CC0 tracks, listed in `CREDITS.md` |
| Sound blocked by the browser | Start audio on first click (standard practice) |
| Bigger download (Three.js ~600 KB) | Load the 3D code only when 3D mode is selected (dynamic `import()`) |

## 7. Decisions
- ✅ 3D chess board and pieces; the minigames stay 2D.
- ✅ Music and sounds: free CC0 tracks, listed in `public/audio/CREDITS.md`.
- ✅ Camera stays on White's side in both modes (players can orbit it).
