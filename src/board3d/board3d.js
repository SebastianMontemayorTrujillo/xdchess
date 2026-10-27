import * as THREE from 'three';
import { createStage } from './scene.js';
import { pieceGeometry, PIECE_MATERIALS } from './models.js';
import { tween, easeIn, wait } from './animate.js';

// 3D board with the same render options as the 2D board.js:
//   const view = createBoard3D(container);
//   view.render(chess, { selected, targets, onSquare });
// plus promise-based animations (slideMove, focusFight, knockOut, resetCamera) that main.js
// awaits before changing the game state; render() afterwards rebuilds the board from that state.

const FILES = 'abcdefgh';
const COLORS = {
  light: new THREE.Color(0xf0d9b5),
  dark: new THREE.Color(0xb58863),
  selected: new THREE.Color(0x33aa99),
  check: new THREE.Color(0xff3333),
  hover: new THREE.Color(0xffffff),
};
const CLICK_SLOP = 6; // px the pointer may move and still count as a click (not an orbit drag)

// Square name <-> board position. a1 is at White's left (toward the camera at +z).
export function squareToXZ(square) {
  return { x: FILES.indexOf(square[0]) - 3.5, z: 4.5 - Number(square[1]) };
}

// Knights face the opponent turned 45° toward the middle of the board, so the camera
// (behind White) sees their horse profile instead of the back of the head.
export function knightRotation(color, x) {
  const dx = x <= 0 ? 1 : -1;
  const dz = color === 'w' ? -1 : 1;
  return Math.atan2(-dz, dx); // rotation.y that turns the model's +x toward (dx, dz)
}

export function createBoard3D(container) {
  const { scene, camera, renderer, controls, setActive } = createStage(container);
  const canvas = renderer.domElement;

  // Board: 64 tiles on a wooden frame, with coordinates on the frame.
  const tiles = new Map(); // square -> mesh
  const tileGeometry = new THREE.BoxGeometry(1, 0.2, 1);
  for (let f = 0; f < 8; f++) {
    for (let rank = 1; rank <= 8; rank++) {
      const square = FILES[f] + rank;
      const tile = new THREE.Mesh(tileGeometry, new THREE.MeshStandardMaterial({ roughness: 0.6 }));
      const { x, z } = squareToXZ(square);
      tile.position.set(x, -0.1, z);
      tile.receiveShadow = true;
      tile.userData = { square, base: (f + rank) % 2 ? COLORS.dark : COLORS.light }; // a1 is dark
      tiles.set(square, tile);
      scene.add(tile);
    }
  }
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(9.3, 0.3, 9.3),
    new THREE.MeshStandardMaterial({ color: 0x4a2f1d, roughness: 0.5 }),
  );
  frame.position.y = -0.2;
  frame.receiveShadow = true;
  scene.add(frame);
  for (let i = 0; i < 8; i++) {
    scene.add(label(FILES[i], i - 3.5, 4.33));
    scene.add(label(String(i + 1), -4.33, 3.5 - i));
  }

  const pieces = new THREE.Group();
  const markers = new THREE.Group();
  scene.add(pieces, markers);
  const dotGeometry = new THREE.CylinderGeometry(0.14, 0.14, 0.02, 24);
  const dotMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 });
  const ringGeometry = new THREE.TorusGeometry(0.42, 0.035, 8, 48).rotateX(Math.PI / 2);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xc81e1e });

  let state = { selected: null, checkSquare: null, onSquare: () => {} };
  let hover = null;

  function recolor() {
    for (const [square, tile] of tiles) {
      const c = tile.material.color.copy(tile.userData.base);
      if (square === state.checkSquare) c.lerp(COLORS.check, 0.6);
      if (square === state.selected) c.lerp(COLORS.selected, 0.6);
      else if (square === hover) c.lerp(COLORS.hover, 0.2);
    }
  }

  // Square under the pointer (tile or piece), or null.
  const raycaster = new THREE.Raycaster();
  function squareAt(event) {
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects([...pieces.children, ...tiles.values()], false)[0];
    return hit ? hit.object.userData.square : null;
  }

  let downAt = null;
  canvas.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > CLICK_SLOP) return;
    downAt = null;
    const square = squareAt(e);
    if (square) state.onSquare(square);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.buttons) return; // dragging the camera
    const square = squareAt(e);
    if (square !== hover) {
      hover = square;
      canvas.style.cursor = square ? 'pointer' : 'grab';
      recolor();
    }
  });
  canvas.addEventListener('pointerleave', () => {
    hover = null;
    recolor();
  });

  function render(chess, { selected = null, targets = [], onSquare }) {
    pieces.clear();
    markers.clear();
    let checkSquare = null;
    for (const row of chess.board()) {
      for (const p of row) {
        if (!p) continue;
        const mesh = new THREE.Mesh(pieceGeometry(p.type), PIECE_MATERIALS[p.color]);
        const { x, z } = squareToXZ(p.square);
        mesh.position.set(x, 0, z);
        if (p.type === 'n') mesh.rotation.y = knightRotation(p.color, x);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = { square: p.square, type: p.type };
        pieces.add(mesh);
        if (p.type === 'k' && p.color === chess.turn() && chess.inCheck()) checkSquare = p.square;
      }
    }
    for (const m of targets) {
      const marker = m.captured
        ? new THREE.Mesh(ringGeometry, ringMaterial)
        : new THREE.Mesh(dotGeometry, dotMaterial);
      const { x, z } = squareToXZ(m.to);
      marker.position.set(x, 0.012, z);
      markers.add(marker);
    }
    state = { selected, checkSquare, onSquare };
    recolor();
  }

  const meshAt = (square) => pieces.children.find((m) => m.userData.square === square);

  // Slide a piece to another square; knights hop in an arc.
  async function slideMove(from, to) {
    const mesh = meshAt(from);
    if (!mesh) return;
    const a = squareToXZ(from);
    const b = squareToXZ(to);
    const dist = Math.hypot(b.x - a.x, b.z - a.z);
    const hop = mesh.userData.type === 'n' ? 0.7 : 0;
    await tween(220 + 60 * Math.min(dist, 6), (t) => {
      mesh.position.set(a.x + (b.x - a.x) * t, hop * Math.sin(Math.PI * t), a.z + (b.z - a.z) * t);
    });
    mesh.userData.square = to;
  }

  // Move the camera in close to two squares, remembering where it was for resetCamera().
  let home = null;
  async function focusFight(squareA, squareB) {
    home ??= { position: camera.position.clone(), target: controls.target.clone() };
    const a = squareToXZ(squareA);
    const b = squareToXZ(squareB);
    const target = new THREE.Vector3((a.x + b.x) / 2, 0.5, (a.z + b.z) / 2);
    // Close-up: 40% of the normal distance (which is larger on narrow screens), at least 5.5.
    const offset = home.position.clone().sub(home.target);
    offset.setLength(Math.max(5.5, offset.length() * 0.4));
    await moveCamera(target.clone().add(offset), target, 800);
  }

  async function resetCamera() {
    if (!home) return;
    const { position, target } = home;
    home = null;
    await moveCamera(position, target, 700);
  }

  async function moveCamera(position, target, ms) {
    const fromPos = camera.position.clone();
    const fromTarget = controls.target.clone();
    controls.enabled = false;
    await tween(ms, (t) => {
      camera.position.lerpVectors(fromPos, position, t);
      controls.target.lerpVectors(fromTarget, target, t);
    });
    controls.enabled = true;
  }

  // The losing piece tips over, then shrinks and fades through the board.
  async function knockOut(square) {
    const mesh = meshAt(square);
    if (!mesh) return;
    mesh.material = mesh.material.clone(); // fade this piece only
    mesh.material.transparent = true;
    const tilt = Math.random() < 0.5 ? 1 : -1;
    await tween(260, (t) => { mesh.rotation.z = tilt * t * Math.PI / 2.2; }, easeIn);
    await wait(150);
    await tween(450, (t) => {
      mesh.scale.setScalar(1 - 0.7 * t);
      mesh.position.y = -0.4 * t;
      mesh.material.opacity = 1 - t;
    });
    mesh.removeFromParent();
  }

  return { render, slideMove, focusFight, resetCamera, knockOut, setActive };
}

// Flat text label lying on the frame.
function label(text, x, z) {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e8d3b0';
  ctx.font = 'bold 40px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, size / 2, size / 2 + 2);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.4, 0.4),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, -0.045, z);
  return mesh;
}
