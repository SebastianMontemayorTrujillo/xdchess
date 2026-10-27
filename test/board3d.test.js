import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { pieceGeometry } from '../src/board3d/models.js';
import { squareToXZ, knightRotation } from '../src/board3d/board3d.js';

const box = (type) => {
  const g = pieceGeometry(type);
  g.computeBoundingBox();
  return g.boundingBox;
};

describe('3D board layout', () => {
  it('places a1 at White\'s near-left corner and h8 at the far-right', () => {
    expect(squareToXZ('a1')).toEqual({ x: -3.5, z: 3.5 });
    expect(squareToXZ('h8')).toEqual({ x: 3.5, z: -3.5 });
    expect(squareToXZ('e4')).toEqual({ x: 0.5, z: 0.5 });
  });
});

describe('3D piece models', () => {
  const types = ['p', 'n', 'b', 'r', 'q', 'k'];

  it('builds every piece standing on the board and fitting inside one square', () => {
    for (const type of types) {
      const b = box(type);
      expect(b.min.y).toBeCloseTo(0, 2);
      for (const axis of ['x', 'z']) {
        expect(b.min[axis]).toBeGreaterThan(-0.5);
        expect(b.max[axis]).toBeLessThan(0.5);
      }
    }
  });

  it('makes taller pieces for more important ranks: pawn < rook < knight < bishop < queen < king', () => {
    const h = (t) => box(t).max.y;
    expect(h('p')).toBeLessThan(h('r'));
    expect(h('r')).toBeLessThan(h('n'));
    expect(h('n')).toBeLessThan(h('b'));
    expect(h('b')).toBeLessThan(h('q'));
    expect(h('q')).toBeLessThan(h('k'));
  });

  it('turns knights toward the opponent and the middle of the board', () => {
    // Direction the knight's snout (+x in the model) points after rotation.
    const facing = (color, x) => {
      const r = knightRotation(color, x);
      return new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), r);
    };
    const b1 = facing('w', squareToXZ('b1').x);
    expect(b1.z).toBeLessThan(0); // toward Black
    expect(b1.x).toBeGreaterThan(0); // toward the center
    const g8 = facing('b', squareToXZ('g8').x);
    expect(g8.z).toBeGreaterThan(0); // toward White
    expect(g8.x).toBeLessThan(0); // toward the center
    // The model itself points its snout along +x.
    expect(box('n').max.x).toBeGreaterThan(-box('n').min.x);
  });

  it('has normals for lighting', () => {
    for (const type of types) expect(pieceGeometry(type).getAttribute('normal')).toBeInstanceOf(THREE.BufferAttribute);
  });
});
