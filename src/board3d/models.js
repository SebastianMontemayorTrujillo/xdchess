import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Chess piece geometry built in code, so there are no model files to load or license.
// Round pieces are lathe profiles (an outline spun around the vertical axis, like a wood lathe);
// the knight is an extruded horse-head silhouette on a lathe base.
// Units: one board square = 1. Pieces stand on y = 0.

const SEGMENTS = 32;
const v = (x, y) => new THREE.Vector2(x, y);

// Outline of a sphere of radius r centered at height cy, from where its radius
// equals `from` (joining the part below) up to the top pole.
function ball(cy, r, from = 0) {
  const pts = [];
  const t0 = Math.asin(Math.min(1, from / r));
  for (let i = 0; i <= 10; i++) {
    const t = t0 + ((Math.PI - t0) * i) / 10;
    pts.push(v(r * Math.sin(t), cy - r * Math.cos(t)));
  }
  pts[pts.length - 1].x = 0; // close exactly at the axis
  return pts;
}

// Shared base: foot, ring and a short taper. Ends at radius 0.25, height 0.2.
const BASE = [v(0, 0), v(0.38, 0), v(0.38, 0.07), v(0.34, 0.1), v(0.34, 0.13), v(0.27, 0.16), v(0.25, 0.2)];

const PROFILES = {
  p: [...BASE, v(0.17, 0.3), v(0.11, 0.42), v(0.18, 0.46), v(0.18, 0.49), v(0.09, 0.51), ...ball(0.62, 0.15, 0.09)],
  r: [...BASE, v(0.24, 0.3), v(0.22, 0.62), v(0.29, 0.66), v(0.29, 0.86), v(0.22, 0.86), v(0.22, 0.8), v(0, 0.8)],
  b: [
    ...BASE, v(0.17, 0.35), v(0.12, 0.58), v(0.2, 0.62), v(0.2, 0.65), v(0.12, 0.68),
    v(0.17, 0.76), v(0.19, 0.84), v(0.16, 0.94), v(0.08, 1.02), v(0.04, 1.04), ...ball(1.09, 0.055, 0.04),
  ],
  q: [
    ...BASE, v(0.2, 0.35), v(0.13, 0.75), v(0.23, 0.8), v(0.23, 0.84), v(0.15, 0.87),
    v(0.19, 1.02), v(0.26, 1.12), v(0.2, 1.14), v(0.12, 1.12), v(0.06, 1.15), ...ball(1.21, 0.07, 0.06),
  ],
  k: [
    ...BASE, v(0.21, 0.35), v(0.14, 0.8), v(0.24, 0.85), v(0.24, 0.89), v(0.16, 0.92),
    v(0.2, 1.06), v(0.24, 1.14), v(0.16, 1.18), v(0.07, 1.2), v(0, 1.2),
  ],
};

// Horse head in the x/y plane, facing +x, standing on y = 0.
function knightHead() {
  const s = new THREE.Shape();
  const pts = [
    [-0.22, 0], [0.22, 0], [0.2, 0.22], [0.12, 0.36], [0.3, 0.44], [0.37, 0.54],
    [0.31, 0.66], [0.12, 0.78], [0.05, 0.93], [-0.03, 0.8], [-0.17, 0.72], [-0.26, 0.5], [-0.25, 0.22],
  ];
  s.moveTo(...pts[0]);
  for (const p of pts.slice(1)) s.lineTo(...p);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth: 0.22, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 2, curveSegments: 4,
  });
  g.translate(0, 0, -0.11);
  return g;
}

// mergeGeometries needs matching geometry: drop material groups, and optionally the index
// (ExtrudeGeometry is non-indexed). Built-in normals are kept, so lathe parts stay smooth.
const plain = (g, nonIndexed = false) => {
  const out = nonIndexed && g.index ? g.toNonIndexed() : g;
  out.clearGroups();
  return out;
};

// The knight faces +x; board3d.js turns each knight mesh to face where it should.
function buildGeometry(type) {
  if (type === 'n') {
    const head = knightHead();
    head.translate(0, 0.13, 0); // sinks into the base a little; keeps the knight shorter than the bishop
    const base = new THREE.LatheGeometry([...BASE, v(0, 0.2)], SEGMENTS);
    return mergeGeometries([plain(base, true), plain(head, true)]);
  }
  const body = new THREE.LatheGeometry(PROFILES[type], SEGMENTS);
  if (type !== 'k') return body;
  // King: add a cross on top.
  const upright = new THREE.BoxGeometry(0.07, 0.24, 0.07).translate(0, 1.3, 0);
  const bar = new THREE.BoxGeometry(0.2, 0.07, 0.07).translate(0, 1.32, 0);
  return mergeGeometries([plain(body), plain(upright), plain(bar)]);
}

const geometryCache = new Map();

export function pieceGeometry(type) {
  if (!geometryCache.has(type)) geometryCache.set(type, buildGeometry(type));
  return geometryCache.get(type);
}

export const PIECE_MATERIALS = {
  w: new THREE.MeshStandardMaterial({ color: 0xf3ead8, roughness: 0.35, metalness: 0.05 }),
  b: new THREE.MeshStandardMaterial({ color: 0x2b2b30, roughness: 0.3, metalness: 0.1 }),
};
