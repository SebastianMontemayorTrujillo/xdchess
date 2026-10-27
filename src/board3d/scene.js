import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Renderer, camera, lights and orbit controls for the 3D board, sized to `container`.
// Throws if WebGL isn't available (the caller falls back to the 2D board).
// setActive(false) stops drawing frames while the board is hidden or covered by a minigame.

// The camera starts this far from the board; narrower (portrait) views move it back
// so the whole board still fits from side to side.
const BASE_DISTANCE = 14.2;
const FIT_ASPECT = 1.15;
export function createStage(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1d2b36); // matches the page background

  // White's side of the board is toward +z.
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 10.5, 9.5);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0.3);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 5;
  controls.maxDistance = 30;
  controls.maxPolarAngle = 1.25; // can't look from under the table
  controls.update();

  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x223344, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-5, 12, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = container;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const offset = camera.position.clone().sub(controls.target);
    offset.setLength(BASE_DISTANCE * Math.max(1, FIT_ASPECT / camera.aspect));
    camera.position.copy(controls.target).add(offset);
  };
  new ResizeObserver(resize).observe(container);
  resize();

  const frame = () => {
    controls.update();
    renderer.render(scene, camera);
  };
  renderer.setAnimationLoop(frame);
  const setActive = (on) => renderer.setAnimationLoop(on ? frame : null);

  return { renderer, scene, camera, controls, setActive };
}
