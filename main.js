import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { dispose } from './utils.js';
import { setupGUI, controllerMap } from './setupGUI.js';
import { initChatInterface } from './chatInterface.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { ViewCube } from './viewcube.js';

/* ---------- renderer / scene ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.physicallyCorrectLights = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdbefff);
// scene.background = new THREE.Color(0xffffff);

const ambient = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambient);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
dirLight.position.set(10, 20, 10);
dirLight.castShadow = true;
scene.add(dirLight);

const gridSize = 100;
const divisions = 100;

const gridHelper = new THREE.GridHelper(gridSize, divisions, 0x000000, 0x000000);
gridHelper.material.opacity = 0.15;
gridHelper.material.transparent = true;
gridHelper.material.depthWrite = false;
gridHelper.renderOrder = -1;
scene.add(gridHelper);

function createBackgroundGrid(size = 1000, step = 10, color = 0x000000) {
  const lines = [];

  for (let i = -size; i <= size; i += step) {
    lines.push(-size, 0, i, size, 0, i); // vertical
    lines.push(i, 0, -size, i, 0, size); // horizontal
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(lines.flat(), 3)
  );

  const material = new THREE.LineBasicMaterial({
    color,
    opacity: 0.3,
    transparent: true,
    depthWrite: false
  });

  const lineSegments = new THREE.LineSegments(geometry, material);
  lineSegments.renderOrder = -2;
  scene.add(lineSegments);
}
createBackgroundGrid();

function updateOrthoCamera(camera, viewHeight) {
  const aspect = window.innerWidth / window.innerHeight;
  const halfHeight = viewHeight / 2;
  const halfWidth = halfHeight * aspect;

  camera.left = -halfWidth;
  camera.right = halfWidth;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.updateProjectionMatrix();
}

/* ---------- camera (orthographic) ---------- */

const aspect = window.innerWidth / window.innerHeight;
const d = 10; // distance from origin to camera
const camera = new THREE.OrthographicCamera(
  -d * aspect, // left
  d * aspect,  // right
  d,           // top
  -d,          // bottom
  0.01,           // near
  100        // far
);
camera.zoom = 2; // initial zoom level
// const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // an animation effect
controls.dampingFactor = 0.1; // how smooth the damping is
controls.minZoom = 1.5; // Minimum zoom level
controls.maxZoom = 100;   // Maximum zoom level

controls.keys = {
	LEFT: 'ArrowLeft', //left arrow
	UP: 'ArrowUp', // up arrow
	RIGHT: 'ArrowRight', // right arrow
	BOTTOM: 'ArrowDown' // down arrow
}

camera.position.set(9.238, 7.435, 6.181);
camera.lookAt(0, 0, 0);
controls.target.set(-1.731, 2.686, -1.376);

controls.mouseButtons = {
  LEFT: THREE.MOUSE.ROTATE,   // orbit
  MIDDLE: THREE.MOUSE.DOLLY,  // zoom
  RIGHT: THREE.MOUSE.PAN      // pan
};

let currentMode = 'default';

window.addEventListener('keydown', (event) => {
  switch (event.key.toLowerCase()) {
    case 'p':
      controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
      currentMode = 'pan';
      break;

    case 'o':
      controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
      currentMode = 'orbit';
      break;

    case 'escape':
      controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN
      };
      currentMode = 'default';
      break;
  }

  controls.update();
});


controls.update();

const helper = new THREE.CameraHelper( camera );
helper.matrixAutoUpdate = true;
helper.setColors(
  new THREE.Color(0xff0000), // frustum
  new THREE.Color(0x00ff00), // cone
  new THREE.Color(0x0000ff), // up
  new THREE.Color(0xffff00), // target
  new THREE.Color(0x00ffff)  // cross
);
// scene.add( helper );



/* ---------- environment map (room) ---------- */
scene.environment = new THREE.PMREMGenerator(renderer)
  .fromScene(new RoomEnvironment(), 0.1).texture;

const cameraHelper = new THREE.CameraHelper(dirLight.shadow.camera);
scene.add(cameraHelper);

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

/* bundle materials into one object */
const mats = {
  steelMat,
  wallMaterial,
  ceilingMaterial,
  floorMaterial,
  roofMaterial,
  ductMat
};

/* ---------- setup GUI (and build scene) ---------- */
// setupGUI(scene, params, camera, controls, mats);


const rebuildScene = setupGUI(scene, params, camera, controls, mats);
initChatInterface(params, rebuildScene, updates => {
  // for each key in updates, if there’s a controller, setValue:
  Object.entries(updates).forEach(([k,v]) => {
    if (controllerMap[k]?.setValue) {
      controllerMap[k].setValue(v);
    }
  });
});

// ViewCube setup
const viewCubeScene = new THREE.Scene();
const viewCubeCamera = camera.clone();

const viewCube = new ViewCube(5);
viewCubeScene.add(viewCube);

const viewCubeRenderer = new THREE.WebGLRenderer({ alpha: true });
viewCubeRenderer.setSize(100, 100);
viewCubeRenderer.setClearColor(0x000000, 0);

viewCubeRenderer.setPixelRatio(window.devicePixelRatio);

document.body.appendChild(viewCubeRenderer.domElement);

viewCubeRenderer.domElement.style.position = 'absolute';
viewCubeRenderer.domElement.style.left = '20px';
viewCubeRenderer.domElement.style.bottom = '50px';
viewCubeRenderer.domElement.style.zIndex = '1000';

/* ---------- resize & render ---------- */
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
(function animate() {
  requestAnimationFrame(animate);
  controls.update();
  updateOrthoCamera(camera, 20);
  renderer.render(scene, camera);

  // Optional: slowly rotate viewcube for testing
  // Sync viewCubeCamera orientation with main camera
  viewCubeCamera.position.copy(camera.position);
  viewCubeCamera.quaternion.copy(camera.quaternion);
  viewCubeCamera.updateProjectionMatrix();

  viewCubeRenderer.render(viewCubeScene, viewCubeCamera);
})();
