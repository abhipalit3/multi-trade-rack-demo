/* ------------------------------------------------------------
   main.js — rack in corridor with light-tone background
   ------------------------------------------------------------ */
   import * as THREE              from 'three';
   import { OrbitControls }       from 'three/addons/controls/OrbitControls.js';
   import { RoomEnvironment }     from 'three/addons/environments/RoomEnvironment.js';
   import GUI                     from 'https://cdn.jsdelivr.net/npm/lil-gui@0.19/+esm';
   
   /* ---------- unit helpers ---------- */
   const FT2M = 0.3048;
   const IN2M = 0.0254;
   const ft2m = ft  => ft * FT2M;
   const in2m = inch=> inch * IN2M;
   const dispose = g => g.traverse(o => o.isMesh && o.geometry?.dispose());
   
   /* ---------- renderer / scene ---------- */
   const renderer = new THREE.WebGLRenderer({ antialias: true });
   renderer.setSize(innerWidth, innerHeight);
   renderer.setClearColor(0xf0f0f0);                      // light grey background
   renderer.toneMapping      = THREE.ACESFilmicToneMapping;
   renderer.outputColorSpace = THREE.SRGBColorSpace;
   document.body.appendChild(renderer.domElement);
   
   const scene  = new THREE.Scene();
   scene.background = new THREE.Color(0xf0f0f0);         // match clearColor
   
   const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
   camera.position.set(10, 10, 10);
   new OrbitControls(camera, renderer.domElement);
   scene.add(new THREE.GridHelper(100, 100));
   
   scene.environment = new THREE.PMREMGenerator(renderer)
     .fromScene(new RoomEnvironment(), 0.08).texture;
   
   /* ---------- materials ---------- */
   const steelMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 1, roughness: 0.25 });
   const shellMat = new THREE.MeshStandardMaterial({ color: 0xbcbcbc, side: THREE.DoubleSide, metalness: 0, roughness: 0.9 });
   
   /* ---------- rack builder ---------- */
   function buildRack(p) {
     const g = new THREE.Group();
   
     const lenM   = ft2m(p.bayCount * p.bayWidth);
     const depthM = ft2m(p.depth);
     const postM  = in2m(p.postSize);
     const beamM  = in2m(p.beamSize);
     const roofY  = ft2m(p.topClearance);
     const tiersM = p.tierHeights.map(ft2m);
     const totalH = tiersM.reduce((s, h) => s + h, 0);
   
     const dx = lenM / 2, dz = depthM / 2;
   
     const postGeom = new THREE.BoxGeometry(postM, totalH, postM);
     const longGeom = new THREE.BoxGeometry(lenM + postM, beamM, beamM);
     const tranGeom = new THREE.BoxGeometry(beamM, beamM, depthM + postM);
   
     // posts
     for (let i = 0; i <= p.bayCount; i++) {
       const x = -dx + ft2m(i * p.bayWidth);
       [dz, -dz].forEach(z => {
         const post = new THREE.Mesh(postGeom, steelMat);
         post.position.set(x, roofY - totalH / 2, z);
         g.add(post);
       });
     }
   
     // collect unique Y levels
     const levels = new Set();
     levels.add(roofY - beamM/2);
     let cursor = roofY;
     tiersM.forEach(h => { levels.add(cursor - h + beamM/2); cursor -= h; });
   
     // rails once per level
     levels.forEach(y => {
       [dz, -dz].forEach(z => {
         const rail = new THREE.Mesh(longGeom, steelMat);
         rail.position.set(0, y, z);
         g.add(rail);
       });
       for (let i = 0; i <= p.bayCount; i++) {
         const x = -dx + ft2m(i * p.bayWidth);
         const t = new THREE.Mesh(tranGeom, steelMat);
         t.position.set(x, y, 0);
         g.add(t);
       }
     });
   
     return g;
   }
   
   /* ---------- corridor shell builder ---------- */
   function buildShell(p) {
     const s = new THREE.Group();
   
     const lenM    = ft2m(p.bayCount * p.bayWidth) + in2m(12);
     const widthM  = ft2m(p.corridorWidth);
     const heightM = ft2m(p.corridorHeight);
     const ceilM   = ft2m(p.ceilingHeight);
   
     const dx = lenM/2, dz = widthM/2;
     const slabGeom = new THREE.PlaneGeometry(lenM, widthM);
     const wallGeom = new THREE.PlaneGeometry(lenM, heightM);
   
     // floor
     const floor = new THREE.Mesh(slabGeom, shellMat);
     floor.rotation.x = -Math.PI/2;
     s.add(floor);
   
     // ceiling (intermediate)
     const ceiling = new THREE.Mesh(slabGeom, shellMat);
     ceiling.rotation.x = -Math.PI/2;
     ceiling.position.y = ceilM;
     s.add(ceiling);
   
     // roof
     const roof = new THREE.Mesh(slabGeom, shellMat);
     roof.rotation.x = Math.PI/2;
     roof.position.y = heightM;
     s.add(roof);
   
     // walls parallel to rack
     const back = new THREE.Mesh(wallGeom, shellMat);
     back.position.set(0, heightM/2, -dz);
     s.add(back);
   
     const front = new THREE.Mesh(wallGeom, shellMat);
     front.rotation.y = Math.PI;
     front.position.set(0, heightM/2, dz);
     s.add(front);
   
     return s;
   }
   
   /* ---------- parameters ---------- */
   const params = {
     corridorWidth  : 10,   // ft
     corridorHeight : 15,   // ft
     ceilingHeight  : 9,    // ft
   
     bayCount       : 4,
     bayWidth       : 3,    // ft
     tierCount      : 2,
     tierHeights    : [2,2],// ft
     depth          : 4,    // ft
     topClearance   : 15,   // ft
   
     postSize       : 2,    // in
     beamSize       : 2     // in
   };
   
   /* ---------- GUI ---------- */
   const gui = new GUI();
   
   const cwCtrl = gui.add(params, 'corridorWidth', 6, 40).name('Corridor width (ft)').onFinishChange(rebuild);
   const chCtrl = gui.add(params, 'corridorHeight', 8, 60).name('Corridor height (ft)').onFinishChange(v => {
     ceilingCtrl.max(v);
     if (params.ceilingHeight > v) params.ceilingHeight = v;
     ceilingCtrl.updateDisplay();
     rebuild();
   });
   const ceilingCtrl = gui.add(params, 'ceilingHeight', 0, params.corridorHeight)
     .name('Ceiling height (ft)').onFinishChange(rebuild);
   
   gui.add(params, 'bayCount', 1, 10, 1).name('Bays').onFinishChange(rebuild);
   gui.add(params, 'bayWidth', 1, 30).name('Bay width (ft)').onFinishChange(rebuild);
   gui.add(params, 'depth',    1, 30).name('Rack depth (ft)').onFinishChange(rebuild);
   
   gui.add(params, 'postSize', 0.5, 12).name('Post size (in)').onFinishChange(rebuild);
   gui.add(params, 'beamSize', 0.5, 12).name('Beam size (in)').onFinishChange(rebuild);
   
   gui.add(params, 'topClearance', 0, 60).name('Top clearance (ft)').onFinishChange(rebuild);
   
   gui.add(params, 'tierCount', 1, 10, 1).name('Tiers').onFinishChange(syncTiers);
   
   let heightFolder = gui.addFolder('Tier heights (ft)');
   refreshHeightSliders();
   
   /* ---------- initial scene ---------- */
   let rackObj  = buildRack(params);
   let shellObj = buildShell(params);
   scene.add(shellObj);
   scene.add(rackObj);
   
   /* ---------- GUI helpers ---------- */
   function syncTiers() {
     while (params.tierHeights.length < params.tierCount) params.tierHeights.push(2);
     params.tierHeights.length = params.tierCount;
     requestAnimationFrame(() => { refreshHeightSliders(); rebuild(); });
   }
   
   function refreshHeightSliders() {
     heightFolder.destroy();
     heightFolder = gui.addFolder('Tier heights (ft)');
     params.tierHeights.forEach((_, i) => {
       heightFolder.add(params.tierHeights, i.toString(), 1, 6)
         .name(`Tier ${i+1}`)
         .onFinishChange(rebuild);
     });
     heightFolder.open(false);
   }
   
   /* ---------- rebuild ---------- */
   function rebuild() {
     dispose(rackObj);  scene.remove(rackObj);
     dispose(shellObj); scene.remove(shellObj);
     rackObj  = buildRack(params);
     shellObj = buildShell(params);
     scene.add(shellObj);
     scene.add(rackObj);
   }
   
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
   