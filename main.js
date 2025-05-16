import * as THREE              from 'three';
import { OrbitControls }       from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment }     from 'three/addons/environments/RoomEnvironment.js';
import GUI                     from 'https://cdn.jsdelivr.net/npm/lil-gui@0.19/+esm';
import { ft2m, in2m, ft2in, dispose, tierHeightFt, bottomBeamCenterY, buildRack, buildShell, buildDuct  } from './utils.js';

/* ---------- renderer / scene ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0xf0f0f0);
renderer.toneMapping      = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('white');

// const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
// camera.position.set(6, 4, 2);

/* ---------- camera (orthographic) ----------------------------------- */
function makeOrtho() {
  const aspect = innerWidth / innerHeight;
  const frustumHeight = 12;                  // pick the “zoom level” you like
  const frustumWidth  = frustumHeight * aspect;
  const cam = new THREE.OrthographicCamera(
    -frustumWidth / 2, frustumWidth / 2,     // left, right
     frustumHeight / 2, -frustumHeight / 2,  // top, bottom
     0.1, 100                                // near, far
  );
  cam.position.set(-3.822, 3.848, -2.242);                 // same eye‑point as before
  cam.zoom = 1.5;                              // you can tweak this too
  cam.updateProjectionMatrix();
  return cam;
}
const camera = makeOrtho();

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0.805, 2.284, 0.339);
controls.update();
// scene.add(new THREE.GridHelper(100, 100));

scene.environment = new THREE.PMREMGenerator(renderer)
  .fromScene(new RoomEnvironment(), 0.05).texture;

/* ---------- camera logger --------------------------------------------- */
function logCamera () {
  /* nice copy‑paste lines for later use */
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

/* press “L” to log the current view */
window.addEventListener('keydown', e => { if (e.code === 'KeyL') logCamera(); });
/* press “C” to log the current view */

/* ---------- materials ---------- */
const steelMat = new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 1, roughness: 0.25 });
const wallMaterial = new THREE.MeshStandardMaterial({ color: '#e0e0e0', metalness: 0.1, roughness: 0.7, transparent: true, opacity: 0.4 });
const ceilingMaterial = new THREE.MeshStandardMaterial({ color: '#f5f5f5', metalness: 0.2, roughness: 0.6, transparent: true, opacity: 0.4 });
const floorMaterial = new THREE.MeshStandardMaterial({ color: '#d6d6d6', metalness: 0.05, roughness: 0.85 });
const roofMaterial = new THREE.MeshStandardMaterial({ color: '#bdbdbd', metalness: 0.3, roughness: 0.4, transparent: true, opacity: 0.4 });
const ductMat = new THREE.MeshStandardMaterial({ color: 0xa0a0a0, metalness: 0.15, roughness: 0.7 });

/* ---------- parameters ---------- */
const params = {
  corridorWidth : 10,
  corridorHeight: 15,
  ceilingHeight : 9,

  ceilingDepth : 2,
  slabDepth  : 2,
  wallThickness: 2,

  bayCount : 4,
  bayWidth : 3,
  tierCount: 2,
  tierHeights:[2,2],
  depth     : 4,
  topClearance: 15,
  postSize  : 2,
  beamSize  : 2,

  ductWidth  : 18,
  ductHeight : 16,
  ductTier   : 1,
  ductOffset  : 0 
};

/* ---------- GUI ---------- */
const gui=new GUI();

/* optional GUI button */
gui.add({logCamera}, 'logCamera').name('Log camera');


function rebuildScene(){
  dispose(rackObj);  scene.remove(rackObj);
  dispose(shellObj); scene.remove(shellObj);
  dispose(ductObj);  scene.remove(ductObj);
  rackObj  = buildRack(params, steelMat);
  shellObj = buildShell(params, wallMaterial, ceilingMaterial, floorMaterial, roofMaterial);
  ductObj  = buildDuct(params, ductMat);
  scene.add(shellObj,rackObj,ductObj);
}

/* ---- corridor & rack sliders ---- */
gui.add(params,'corridorWidth',6,40).name('Corridor width (ft)')
   .onFinishChange(()=>{updateLimits(); rebuildScene();});

gui.add(params,'corridorHeight',8,60).name('Corridor height (ft)')
   .onFinishChange(()=>{updateLimits(); rebuildScene();});

const ceilCtrl = gui.add(params,'ceilingHeight',0,params.corridorHeight)
   .name('Ceiling height (ft)')
   .onFinishChange(()=>{updateLimits(); rebuildScene();});

gui.add(params,'bayCount',1,10,1).name('Bays').onFinishChange(rebuildScene);
gui.add(params,'bayWidth',1,30).name('Bay width (ft)').onFinishChange(rebuildScene);

const depthCtrl = gui.add(params,'depth',1,params.corridorWidth)
   .name('Rack depth (ft)')
   .onFinishChange(()=>{updateDuctLimits(); rebuildScene();});

const topCtrl = gui.add(params,'topClearance',
   Math.max(1,params.corridorHeight-params.ceilingHeight),
   params.corridorHeight)
   .name('Top clearance (ft)')
   .onFinishChange(rebuildScene);

gui.add(params,'postSize',0.5,12).name('Post size (in)')
   .onFinishChange(()=>{updateDuctLimits(); rebuildScene();});
gui.add(params,'beamSize',0.5,12).name('Beam size (in)')
   .onFinishChange(()=>{updateDuctLimits(); rebuildScene();});

/* ---- tiers ---- */
gui.add(params,'tierCount',1,10,1).name('Tiers').onFinishChange(syncTiers);
let heightFolder=gui.addFolder('Tier heights (ft)');
refreshHeightSliders();

/* ---- duct ---- */
const ductFolder=gui.addFolder('Duct');
const widthCtrl  = ductFolder.add(params,'ductWidth',4, ft2in(params.depth) - params.postSize)
          .name('Width (in)')
          .onFinishChange(()=>{          // ★ NEW
          updateDuctLimits();          // recompute offset clamp
          rebuildScene();              // rebuild with new size
          });
const heightCtrl = ductFolder.add(params,'ductHeight',4, ft2in(tierHeightFt(params,params.ductTier))).name('Height (in)').onFinishChange(rebuildScene);
const tierCtrl   = ductFolder.add(params,'ductTier',1,params.tierCount,1).name('Run in tier')
                    .onFinishChange(()=>{updateDuctLimits(); rebuildScene();});
const initHalfClear = ft2in(params.depth)/2
                   - params.postSize/2
                   - params.ductWidth/2;
const offsetCtrl = ductFolder
  .add(params,'ductOffset',
       -initHalfClear,           // min
       initHalfClear)           // max
  .name('Side offset (in)')
  .onFinishChange(rebuildScene);
ductFolder.open(false);

/* ---------- dynamic limits ---------- */
function updateLimits(){
  /* top clearance bounds */
  const minTop = Math.max(1, params.corridorHeight - params.ceilingHeight);
  const maxTop = params.corridorHeight;
  topCtrl.min(minTop).max(maxTop);
  params.topClearance = Math.min(Math.max(params.topClearance,minTop),maxTop);
  topCtrl.updateDisplay();

  /* depth bound */
  depthCtrl.max(params.corridorWidth);
  params.depth = Math.min(params.depth, params.corridorWidth);
  depthCtrl.updateDisplay();

  updateDuctLimits();
}

function updateDuctLimits(){
  /* height & width */
  const maxH = Math.max(1, ft2in(tierHeightFt(params,params.ductTier)));
  heightCtrl.max(maxH);
  params.ductHeight = Math.min(params.ductHeight, maxH);
  heightCtrl.updateDisplay();

  const maxW = Math.max(1, ft2in(params.depth) - params.postSize);
  widthCtrl.max(maxW);
  params.ductWidth = Math.min(params.ductWidth, maxW);
  widthCtrl.updateDisplay();

  /* side offset  */
  const halfClear = ft2in(params.depth)/2 - params.postSize/2 - params.ductWidth/2;
  const maxO = Math.max(0, halfClear);
  offsetCtrl.min(-maxO).max(maxO);
  params.ductOffset = THREE.MathUtils.clamp(params.ductOffset, -maxO, maxO);
  offsetCtrl.updateDisplay();
}

/* ---------- tier helpers ---------- */
function syncTiers(){
  while(params.tierHeights.length<params.tierCount) params.tierHeights.push(2);
  params.tierHeights.length=params.tierCount;
  tierCtrl.max(params.tierCount);
  if(params.ductTier>params.tierCount){ params.ductTier=params.tierCount; tierCtrl.updateDisplay(); }
  refreshHeightSliders();
  updateDuctLimits();
  rebuildScene();
}

function refreshHeightSliders(){
  heightFolder.destroy();
  heightFolder=gui.addFolder('Tier heights (ft)');
  params.tierHeights.forEach((_,i)=>{
    heightFolder.add(params.tierHeights,i.toString(),1,6)
      .name(`Tier ${i+1}`)
      .onFinishChange(()=>{ updateDuctLimits(); rebuildScene(); });
  });
  heightFolder.open(false);
}

/* ---------- initial scene ---------- */
let rackObj  = buildRack(params, steelMat);
let shellObj = buildShell(params, wallMaterial, ceilingMaterial, floorMaterial, roofMaterial);
let ductObj  = buildDuct(params, ductMat);
scene.add(rackObj, shellObj, ductObj);
updateLimits();

/* ---------- resize & render ---------- */
addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
});
(function animate(){
  requestAnimationFrame(animate);
  renderer.render(scene,camera);
})();
