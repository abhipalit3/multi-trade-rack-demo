/* ------------------------------------------------------------
   main.js — rack with tier‑constrained duct (beam‑accurate)
   ------------------------------------------------------------ */
import * as THREE              from 'three';
import { OrbitControls }       from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment }     from 'three/addons/environments/RoomEnvironment.js';
import GUI                     from 'https://cdn.jsdelivr.net/npm/lil-gui@0.19/+esm';

/* ---------- unit helpers ---------- */
const FT2M = 0.3048;
const IN2M = 0.0254;
const ft2m  = ft   => ft   * FT2M;
const in2m  = inch => inch * IN2M;
const ft2in = ft   => ft   * 12;
const dispose = g => g.traverse(o => o.isMesh && o.geometry?.dispose());

/* ---------- renderer / scene ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0xf0f0f0);
renderer.toneMapping      = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('white');

const axesHelper = new THREE.AxesHelper( 6 );
axesHelper.setColors(new THREE.Color( 'blue' ), new THREE.Color( 'green' ), new THREE.Color( 'red' ));
scene.add( axesHelper );

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(6, 4, 2);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(1, 3, 0);
controls.update();
// scene.add(new THREE.GridHelper(100, 100));

scene.environment = new THREE.PMREMGenerator(renderer)
  .fromScene(new RoomEnvironment(), 0.05).texture;

/* ---------- materials ---------- */
const steelMat = new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 1, roughness: 0.25 });
const shellMat = new THREE.MeshStandardMaterial({ color: 0xbcbcbc, side: THREE.DoubleSide, metalness: 0, roughness: 0.9 });
const ductMat  = new THREE.MeshStandardMaterial({ color: 0xa0a0a0, metalness: 0.15, roughness: 0.75 });

/* ---------- parameters ---------- */
const params = {
  corridorWidth : 10,
  corridorHeight: 15,
  ceilingHeight : 9,

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
  ductTier   : 1
};


/**
 * Build a parametric pallet‑rack frame and return it as a {@link THREE.Group}.
 *
 * The rack is centred on the world origin in the *plan* (X–Z) plane and sits
 * on Y = 0 (floor).  
 * Local axes:
 * ```
 *   X : length  (bays laid end‑to‑end)
 *   Y : height  (up)
 *   Z : depth   (front ↔ back)
 * ```
 *
 * **Geometry notes**
 * - **Posts** are square columns (`postSize × postSize` inches).  
 * - **Beams** are square members (`beamSize` inches) used for roof and for the
 *   *bottom* of every tier.  
 * - The centre‑line of the roof beam is positioned at **`topClearance` ft**.  
 * - Tiers are defined *top‑to‑bottom* by their clear heights `tierHeights[]`.
 *
 * @param {Object} p                         Rack parameters (feet unless noted)
 * @param {number} p.bayCount                Number of bays along X (≥ 1)
 * @param {number} p.bayWidth                Clear width of each bay (ft)
 * @param {number} p.depth                   Overall rack depth (ft, along Z)
 * @param {number} p.postSize                Post width × depth (inches)
 * @param {number} p.beamSize                Beam depth × width (inches)
 * @param {number} p.topClearance            Y‑coord of roof‑beam centre (ft)
 * @param {number[]} p.tierHeights           Clear tier heights *top → bottom* (ft)
 *                                           `tierHeights.length` = tier count
 * @param {THREE.Material} [p.material]      Optional override for the steel
 *                                           material; defaults to `steelMat`
 *
 * @returns {THREE.Group} A group containing all posts and beams that make up
 *                        the rack.  Child meshes share the material
 *                        `p.material || steelMat`.
 */
function buildRack(p){
  const mat   = p.material ?? steelMat;
  const g     = new THREE.Group();

  /* -- pre‑compute common metric dimensions -- */
  const lenM   = ft2m(p.bayCount * p.bayWidth);   // overall length (m)
  const depthM = ft2m(p.depth);                   // overall depth  (m)
  const postM  = in2m(p.postSize);                // post size      (m)
  const beamM  = in2m(p.beamSize);                // beam size      (m)
  const roofY  = ft2m(p.topClearance);            // roof beam Y    (m)
  const tiersM = p.tierHeights.map(ft2m);         // clear tier heights [m]
  const totalH = tiersM.reduce((s,h)=>s+h,0) + (p.tierCount - 1) * beamM;     // total clear height (Sum of all tiers + (number of tiers - 1 )* beamM)
  console.log("totalH", totalH);
  console.log("tiersM", tiersM);
  const dx = lenM/2, dz = depthM/2;               // half‑extents

  /* -- reusable geometries ------------------------------------------------- */
  const postGeom = new THREE.BoxGeometry(postM, totalH, postM);
  const longGeom = new THREE.BoxGeometry(lenM + postM, beamM, beamM);       // X beams
  const tranGeom = new THREE.BoxGeometry(beamM, beamM, depthM + postM);     // Z beams

  /* -- vertical posts ---------------------------------------------------- */
  /* There are (bayCount + 1) frames along X and two frames (front/back) along Z. */
  const zRows = [-dz,  dz];                        // back row, front row
  for (let bay = 0; bay <= p.bayCount; bay++) {    // walk bays left ➜ right
    const x = -dx + ft2m(bay * p.bayWidth);        // X‑position of this frame
    for (const z of zRows) {                       // place back & front posts
      const post = new THREE.Mesh(postGeom, mat);
      post.position.set(
        x,                     // length direction
        roofY - ( tiersM.reduce((s,h)=>s+h,0) + (p.tierCount + 1) * beamM) / 2,    // centre‑Y so post sits on the floor
        z                      // depth direction (back / front)
      );
      g.add(post);
    }
  }

/* ---------- beam levels: roof + bottom of each tier -------------------- */
const levels = new Set();
levels.add(roofY - beamM / 2);               // roof‑beam centre‑line
let cursor = roofY;               // cursor for tier heights

for (let i = 0; i < p.tierCount; i++) { // walk tiers upward
  const h = tiersM[i];            // height of this tier
  const bottomBeam = cursor - ((i + 1) * beamM )- h - beamM/2     // cursor to bottom of this tier
  levels.add(bottomBeam);        // bottom‑beam centre‑line
  cursor -= h;                  // move cursor down to next tier
}


const levelList   = [...levels];             // array for min/max searches
const topLevel    = Math.max(...levelList);  // highest beam elevation
const bottomLevel = Math.min(...levelList);  // lowest  beam elevation

/* ---------- longitudinal beams: ONLY at top & bottom ------------------- */
[topLevel, bottomLevel].forEach(y => {
  [dz, -dz].forEach(z => {
    const rail = new THREE.Mesh(longGeom, mat);
    rail.position.set(0, y, z);
    g.add(rail);
  });
});

/* ---------- transverse beams: at every level --------------------------- */
levelList.forEach(y => {
  for (let i = 0; i <= p.bayCount; i++) {
    const x = -dx + ft2m(i * p.bayWidth);
    const tr = new THREE.Mesh(tranGeom, mat);
    tr.position.set(x, y, 0);
    g.add(tr);
  }
});

return g;
}


/* ---------- shell builder ---------- */
/**
 * Build a simple corridor “shell” (floor, intermediate ceiling, roof,
 * front / back walls) that encloses the rack.
 *
 * The shell is centred on world‑origin in X and Z and sits on Y = 0.  
 * It is intentionally very lightweight: each slab / wall is a single
 * {@link THREE.Mesh} using `shellMat`.
 *
 * Geometry reference
 * ```
 *           Y
 *           ↑
 *   roofM ──┼────────── (roof slab)
 *           │
 *   ceilM ──┼────────── (intermediate ceiling slab)
 *           │
 *  floor ───┼────────── (floor slab at Y=0)
 *           └── Z (depth)
 * ```
 *
 * @param {Object} p
 * @param {number} p.bayCount         Number of rack bays (used for shell length)
 * @param {number} p.bayWidth         Width of one bay (ft)
 * @param {number} p.corridorWidth    Inside corridor width  (ft, along Z)
 * @param {number} p.corridorHeight   Total corridor height  (ft, along Y)
 * @param {number} p.ceilingHeight    Height of the **intermediate** ceiling (ft)
 * @param {THREE.Material} [p.material=shellMat] Optional material override
 *
 * @returns {THREE.Group} Group containing five meshes:
 *  * floor, ceiling, roof slabs (XY‑planes)  
 *  * front & back walls   (XZ‑planes)
 */
function buildShell(p){
  const mat = p.material ?? shellMat;
  const s   = new THREE.Group();

  /* -- metric dimensions -------------------------------------------------- */
  const lenM    = ft2m(p.bayCount * p.bayWidth) + in2m(12); // little allowance
  const widthM  = ft2m(p.corridorWidth);
  const heightM = ft2m(p.corridorHeight);
  const ceilM   = ft2m(p.ceilingHeight);

  /* -- reusable geometries ------------------------------------------------- */
  const slabGeom = new THREE.PlaneGeometry(lenM, widthM);   // XY‑plane
  const wallGeom = new THREE.PlaneGeometry(lenM, heightM);  // XZ‑plane

  /* -- horizontal slabs ---------------------------------------------------- */
  const floor = new THREE.Mesh(slabGeom, mat);
  floor.rotation.x = -Math.PI/2;            // make it horizontal
  s.add(floor);

  const ceiling = new THREE.Mesh(slabGeom, mat);
  ceiling.rotation.x = -Math.PI/2;
  ceiling.position.y = ceilM;
  s.add(ceiling);

  const roof = new THREE.Mesh(slabGeom, mat);
  roof.rotation.x =  Math.PI/2;
  roof.position.y = heightM;
  s.add(roof);

  /* -- vertical walls ------------------------------------------------------ */
  const dz = widthM/2;
  const back = new THREE.Mesh(wallGeom, mat);
  back.position.set(0, heightM/2, -dz);
  s.add(back);

  const front = new THREE.Mesh(wallGeom, mat);
  front.rotation.y = Math.PI;              // flip normal inward
  front.position.set(0, heightM/2,  dz);
  s.add(front);

  return s;
}


/* ---------- tier helpers ---------- */
function tierHeightFt(p,idx){ return p.tierHeights[idx-1]; }

/* centre‑Y of the bottom beam for tier idx (1‑based) */
function bottomBeamCenterY(p, idx){
  const beamM = in2m(p.beamSize);
  let y = ft2m(p.topClearance) - beamM/2;     // centre of roof beam
  for(let i=0;i<idx;i++){
    y -= beamM/2;                             // to bottom of current beam
    y -= ft2m(p.tierHeights[i]);              // clear height of tier i+1
    y -= beamM/2;                             // to centre of next beam down
  }
  return y;
}

/* ---------- duct builder ---------- */
function buildDuct(p){
  const lenM = ft2m(p.bayCount * p.bayWidth);
  const geom = new THREE.BoxGeometry(
    lenM + in2m(4),
    in2m(p.ductHeight),
    in2m(p.ductWidth)
  );
  const duct = new THREE.Mesh(geom, ductMat);

  const beamM = in2m(p.beamSize);
  const bottom = bottomBeamCenterY(p,p.ductTier) + beamM/2; // top of bottom beam
  duct.position.set(0, bottom + in2m(p.ductHeight)/2, 0);
  return duct;
}

/* ---------- GUI ---------- */
const gui=new GUI();

function rebuildScene(){
  dispose(rackObj);  scene.remove(rackObj);
  dispose(shellObj); scene.remove(shellObj);
  dispose(ductObj);  scene.remove(ductObj);
  dispose(axesHelper); scene.remove(axesHelper);
  rackObj  = buildRack(params);
  shellObj = buildShell(params);
  ductObj  = buildDuct(params);
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
const widthCtrl  = ductFolder.add(params,'ductWidth',4, ft2in(params.depth)-2*params.postSize).name('Width (in)').onFinishChange(rebuildScene);
const heightCtrl = ductFolder.add(params,'ductHeight',4, ft2in(tierHeightFt(params,params.ductTier))).name('Height (in)').onFinishChange(rebuildScene);
const tierCtrl   = ductFolder.add(params,'ductTier',1,params.tierCount,1).name('Run in tier')
                    .onFinishChange(()=>{updateDuctLimits(); rebuildScene();});
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
  const maxH = Math.max(1, ft2in(tierHeightFt(params,params.ductTier)));
  heightCtrl.max(maxH);
  params.ductHeight = Math.min(params.ductHeight,maxH);
  heightCtrl.updateDisplay();

  const maxW = Math.max(1, ft2in(params.depth) - 2*params.postSize);
  widthCtrl.max(maxW);
  params.ductWidth = Math.min(params.ductWidth,maxW);
  widthCtrl.updateDisplay();
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
let rackObj  = buildRack(params);
let shellObj = buildShell(params);
let ductObj  = buildDuct(params);
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
