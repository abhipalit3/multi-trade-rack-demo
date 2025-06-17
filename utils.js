import * as THREE from 'three';

/* ---------- unit helpers ---------- */
const FT2M = 0.3048;
const IN2M = 0.0254;
export const ft2m  = ft   => ft   * FT2M;
export const in2m  = inch => inch * IN2M;
export const ft2in = ft   => ft   * 12;
export const dispose = g => g.traverse(o => o.isMesh && o.geometry?.dispose());


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
export function buildRack(p, steelMat){
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
export function buildShell(p, wallMaterial, ceilingMaterial, floorMaterial, roofMaterial){
  const s   = new THREE.Group();

  /* -- metric dimensions -------------------------------------------------- */
  const lenM    = ft2m(p.bayCount * p.bayWidth) + in2m(12); // little allowance
  const widthM  = ft2m(p.corridorWidth);
  const heightM = ft2m(p.corridorHeight);
  const ceilM   = ft2m(p.ceilingHeight);

  /* -- reusable geometries ------------------------------------------------- */
  const slabGeom = new THREE.BoxGeometry(lenM, widthM * 2, in2m(p.slabDepth));   // XY‑plane
  const ceilingGeom = new THREE.BoxGeometry(lenM, widthM, in2m(p.ceilingDepth));         // XY‑plane
  const wallGeom = new THREE.BoxGeometry(lenM, heightM, in2m(p.wallThickness));  // XZ‑plane

  /* -- horizontal slabs ---------------------------------------------------- */
  const floor = new THREE.Mesh(slabGeom, floorMaterial);
  floor.position.y = -in2m(p.slabDepth)/2;                     // floor at Y=0
  floor.rotation.x = -Math.PI/2;            // make it horizontal
  s.add(floor);

  const ceiling = new THREE.Mesh(ceilingGeom, ceilingMaterial);
  ceiling.rotation.x = -Math.PI/2;
  ceiling.position.y = ceilM - in2m(p.ceilingDepth)/2; // ceiling at Y=ceilM
  s.add(ceiling);

  const roof = new THREE.Mesh(slabGeom, roofMaterial);
  roof.rotation.x =  Math.PI/2;
  roof.position.y = heightM + in2m(p.slabDepth)/2; // roof at Y=heightM
  s.add(roof);

  /* -- vertical walls ------------------------------------------------------ */
  const dz = widthM/2 + in2m(p.wallThickness/2); 
  const back = new THREE.Mesh(wallGeom, wallMaterial);
  back.position.set(0, heightM/2, -dz);
  s.add(back);

  const front = new THREE.Mesh(wallGeom, wallMaterial);
  front.rotation.y = Math.PI;              // flip normal inward
  front.position.set(0, heightM/2,  dz);
  s.add(front);

  return s;
}

/* ---------- tier helpers ---------- */
export function tierHeightFt(p,idx){ return p.tierHeights[idx-1]; }

/* centre‑Y of the bottom beam for tier idx (1‑based) */
export function bottomBeamCenterY(p, idx){
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
export function buildDuct(p, ductMat){
  const lenM = ft2m(p.bayCount * p.bayWidth);
  const geom = new THREE.BoxGeometry(
    lenM + in2m(4),
    in2m(p.ductHeight),
    in2m(p.ductWidth)
  );
  const duct = new THREE.Mesh(geom, ductMat);

  const beamM = in2m(p.beamSize);
  const bottom = bottomBeamCenterY(p, p.ductTier) + beamM/2; // top of bottom beam
  duct.position.set(
    0,                                           // X stays centred
    bottom + in2m(p.ductHeight)/2,               // Y (unchanged)
    in2m(p.ductOffset)                           // Z side‑shift ★ NEW
  );
  return duct;
}

/* =========================================================================
   buildPipesFlexible()
   -------------------------------------------------------------------------
   Builds one or more circular pipes per tier, oriented along the X-axis.

   • tierIdx   : 1-based index of the tier the pipes belong to
   • pipes[]   : array of pipe descriptors; each pipe has:
                   - diamIn     : diameter (inches)
                   - sideOffIn  : horizontal offset (inches, along Z)
                   - vertOffIn  : vertical offset from bottom beam (inches)
   • pipeMat   : THREE.Material instance for the pipes

   Pipes are positioned:
   - Vertically: from the top of the bottom beam in the tier,
     plus the specified `vertOffIn`, plus `radius` so they rest on their base.
   - Clamped vertically to stay within the tier (avoids pipe poking outside).
   - Horizontally centered and offset by `sideOffIn` (left-right).

   Returns:
   - A THREE.Group containing all pipe meshes for the tier.
   ========================================================================= */
export function buildPipesFlexible(p, tierIdx, pipes, pipeMat) {
  const normalise = o => ({
    diamIn     : o.diamIn     ?? o.diam,
    sideOffIn  : o.sideOffIn  ?? o.side,
    vertOffIn  : o.vertOffIn  ?? o.vert
  });

  pipes = pipes.map(normalise);

  const lenM  = ft2m(p.bayCount * p.bayWidth) + in2m(4); // pipe length (X-axis) with slight overhang
  const beamM = in2m(p.beamSize);

  const g = new THREE.Group();

  // Compute vertical bounds of the tier
  const tierHeightM  = ft2m(p.tierHeights[tierIdx - 1]);      // clear height of tier
  const tierBottomY  = bottomBeamCenterY(p, tierIdx) + beamM / 2;
  const tierTopY     = tierBottomY + tierHeightM;

  pipes.forEach(({ diamIn, sideOffIn, vertOffIn }) => {
    const rM = in2m(diamIn) / 2;
    const geom = new THREE.CylinderGeometry(rM, rM, lenM, 32);
    geom.rotateZ(Math.PI / 2); // X-axis pipe

    // Position Y: bottom beam top + user offset + radius
    let y = tierBottomY + in2m(vertOffIn) + rM;

    // Clamp within tier
    const maxY = tierTopY - rM;
    const minY = tierBottomY + rM;
    y = THREE.MathUtils.clamp(y, minY, maxY);

    const mesh = new THREE.Mesh(geom, pipeMat);
    mesh.position.set(
      0,              // X (centered)
      y,              // Y (adjusted)
      in2m(sideOffIn) // Z
    );
    g.add(mesh);
  });

  return g;
}