import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { dispose } from './utils.js';
import { setupGUI } from './setupGUI.js';

/* ---------- renderer / scene ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0xf0f0f0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('white');

/* ---------- camera (orthographic) ---------- */
function makeOrtho() {
  const aspect = innerWidth / innerHeight;
  const frustumHeight = 12;
  const frustumWidth = frustumHeight * aspect;
  const cam = new THREE.OrthographicCamera(
    -frustumWidth / 2, frustumWidth / 2,
     frustumHeight / 2, -frustumHeight / 2,
     0.1, 100
  );
  cam.position.set(-3.822, 3.848, -2.242);
  cam.zoom = 1.5;
  cam.updateProjectionMatrix();
  return cam;
}
const camera = makeOrtho();


/* ---------- controls (orbit) ---------- */
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0.805, 2.284, 0.339);
controls.update();

/* ---------- environment map (room) ---------- */
scene.environment = new THREE.PMREMGenerator(renderer)
  .fromScene(new RoomEnvironment(), 0.1).texture;


/* ---------- camera logger ---------- */
function logCamera () {
  console.log(
    `camera.position.set(${camera.position.x.toFixed(3)}, ` +
    `${camera.position.y.toFixed(3)}, ${camera.position.z.toFixed(3)});`
  );
  console.log(
    `controls.target.set(${controls.target.x.toFixed(3)}, ` +
    `${controls.target.y.toFixed(3)}, ${controls.target.z.toFixed(3)});` +
    ` controls.update();`
  );
}
window.addEventListener('keydown', e => {
  if (e.code === 'KeyL') logCamera();
});

/* ---------- materials ---------- */
const texLoader = new THREE.TextureLoader();

// Example URLs – replace with your own texture files if needed
const floorAlbedo = texLoader.load('./textures/Floor-Roof/Wood066_1K-JPG_Color.jpg');
const floorNormal = texLoader.load('./textures/Floor-Roof/Wood066_1K-JPG_NormalGL.jpg');
const floorRough  = texLoader.load('./textures/Floor-Roof/Wood066_1K-JPG_Roughness.jpg');


[floorAlbedo, floorNormal, floorRough].forEach(tex => {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8); // controls tiling frequency
});

const floorMaterial = new THREE.MeshStandardMaterial({
  map: floorAlbedo,
  normalMap: floorNormal,
  roughnessMap: floorRough,
  metalness: 0.2,
  roughness: 1.0
});

// const roofMaterial = new THREE.MeshStandardMaterial({
//   map: floorAlbedo,
//   normalMap: floorNormal,
//   roughnessMap: floorRough,
//   metalness: 0.2,
//   roughness: 1.0,
//   transparent: true, 
//   opacity: 0.4 
// });

const steelMat = new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 1, roughness: 0.25 });
const wallMaterial = new THREE.MeshStandardMaterial({ color: '#e0e0e0', metalness: 0.1, roughness: 0.7, transparent: true, opacity: 0.4 });
const ceilingMaterial = new THREE.MeshStandardMaterial({ color: '#f5f5f5', metalness: 0.2, roughness: 0.6, transparent: true, opacity: 0.4 });
// const floorMaterial = new THREE.MeshStandardMaterial({ color: '#d6d6d6', metalness: 0.05, roughness: 0.85 });
const roofMaterial = new THREE.MeshStandardMaterial({ color: '#bdbdbd', metalness: 0.3, roughness: 0.4, transparent: true, opacity: 0.4 });
const ductMat = new THREE.MeshStandardMaterial({ color: '#d05e8f', metalness: 0.50, roughness: 0.9, transparent: true, opacity: 1 });

/* ---------- parameters ---------- */
const params = {
  corridorWidth  : 10,
  corridorHeight : 15,
  ceilingHeight  : 9,
  ceilingDepth   : 2,
  slabDepth      : 4,
  wallThickness  : 6,

  bayCount  : 4,
  bayWidth  : 3,
  depth     : 4,

  topClearance : 15,
  postSize     : 2,
  beamSize     : 2,

  tierCount    : 2,
  tierHeights  : [2, 2],   // ft  (parallel array #1)

  /* per-tier duct settings – parallel arrays keep the old utils untouched */
  ductEnabled  : [true, false],
  ductWidths   : [18, 18], // in  (parallel array #2)
  ductHeights  : [16, 16], // in  (parallel array #3)
  ductOffsets  : [ 0,  0]  // in  (parallel array #4)
};

/* ---------- setup GUI (and build scene) ---------- */
setupGUI(scene, params, camera, controls, {
  steelMat,
  wallMaterial,
  ceilingMaterial,
  floorMaterial,
  roofMaterial,
  ductMat
});

/* ---------- resize & render ---------- */
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
(function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
})();
