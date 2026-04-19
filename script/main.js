import * as THREE from 'three';
import { WebGPURenderer, MeshBasicNodeMaterial, StorageTexture } from 'three/webgpu';
import { vec2, uvec2, uniform, storageTexture } from 'three/tsl';

import { addForce, advectVelocity, updateDivergence, updatePressure, subtractGradient, renderShader } from './script/shaders.js';
import { PointerManager } from './script/pointer.js';

const width = 500, height = 500;

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const loader = new THREE.TextureLoader();

const storageTextures = Array(6).fill().map(() => {
  const storageTexture = new StorageTexture(width, height);
  storageTexture.type = THREE.FloatType;
  return storageTexture;
});

const uTime = uniform(0);
const uScreenSize = uniform(uvec2(width, height));
const uMouse = uniform(vec2(0, 0));
const uDeltaV = uniform(vec2(0, 0));
const uRadius = uniform(15);
const uDeltaT = uniform(1);
const uDsp = uniform(0.95);
const uIsDragging = uniform(false);

const addForceNode = addForce(storageTextures[0], storageTextures[1], uScreenSize, uMouse, uDeltaV, uRadius, uIsDragging).compute(width * height);
const advectVelocityNode = advectVelocity(storageTextures[1], storageTextures[2], uScreenSize, uDeltaT, uDsp).compute(width * height);
const updateDivergenceNode = updateDivergence(storageTextures[2], storageTextures[3], uScreenSize).compute(width * height);
const updatePressureNodeA = updatePressure(storageTextures[3], storageTextures[4], uScreenSize).compute(width * height);
const updatePressureNodeB = updatePressure(storageTextures[4], storageTextures[3], uScreenSize).compute(width * height);
const subtractGradientNode = subtractGradient(storageTextures[4], storageTextures[0], uScreenSize).compute(width * height);
const renderNode = renderShader(storageTextures[0], storageTextures[5], uScreenSize, uTime).compute(width * height);

const material = new MeshBasicNodeMaterial({map: storageTextures[5]});

const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
scene.add(quad);

const renderer = new WebGPURenderer();
renderer.setSize(width, height);
document.body.appendChild(renderer.domElement);

const pointerManager = new PointerManager(renderer.domElement);

await renderer.init();

let prevTime = performance.now();
function animate(tm) {
  uIsDragging.value = pointerManager.isDragging;
  uMouse.value.x = pointerManager.x;
  uMouse.value.y = pointerManager.y;
  uDeltaV.value.x = pointerManager.deltaX * 500;
  uDeltaV.value.y = pointerManager.deltaY * 500;
  const deltaT = tm - prevTime;
  
  uTime.value = performance.now();
  
  renderer.compute(addForceNode);
  
  const stepCount = Math.min(Math.max(Math.floor(deltaT * 240), 1), 8);
  const simulationDeltaT = deltaT / stepCount;
  uDeltaT.value = simulationDeltaT;
  for (let i = 0; i < stepCount; i++) {
    renderer.compute(advectVelocityNode);
    renderer.compute(updateDivergenceNode);
    for (let j = 0; j < 5; j++) {
      if (j % 2 == 0) renderer.compute(updatePressureNodeA);
      else renderer.compute(updatePressureNodeB);
    }
    renderer.compute(subtractGradientNode);
  }
  
  renderer.compute(renderNode);
  renderer.render(scene, camera);
  window.requestAnimationFrame(animate);
  prevTime = tm;
}
animate();
