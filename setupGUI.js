/* ------------------------------------------------------------------
   setupGUI.js  –  per-tier ducts and individually editable pipes
   ------------------------------------------------------------------ */
import GUI        from 'https://cdn.jsdelivr.net/npm/lil-gui@0.19/+esm';
import * as THREE from 'three';
import { ft2in, tierHeightFt, dispose,
         buildRack, buildShell, buildDuct,
         buildPipesFlexible } from './utils.js';

export function setupGUI(scene, p, camera, controls, mats){
  const {
    steelMat,
    wallMaterial, ceilingMaterial, floorMaterial, roofMaterial,
    ductMat
  } = mats;

  /* default pipe material */
  const pipeMat = new THREE.MeshStandardMaterial({ color:'#4eadff', metalness:0.3, roughness:0.6 });

/* ────────────────────────────────────────────────────────
   1 ◂ data-model guards
   ──────────────────────────────────────────────────────── */
  const ensureA = key => { if (!p[key]) p[key] = []; };
  ['tierHeights',
   'ductEnabled','ductWidths','ductHeights','ductOffsets',
   'pipeEnabled','pipesPerTier'              /* array of arrays */
  ].forEach(ensureA);

  /* make sure arrays are long enough */
  const grow = (arr,n,mk)=>{ while(arr.length<n) arr.push(mk()); arr.length=n; };
  function syncArrays(){
    const n = p.tierCount;
    grow(p.tierHeights , n, ()=>2);

    grow(p.ductEnabled , n, ()=>false);
    grow(p.ductWidths  , n, ()=>18);
    grow(p.ductHeights , n, ()=>16);
    grow(p.ductOffsets , n, ()=>0);

    grow(p.pipeEnabled , n, ()=>false);
    grow(p.pipesPerTier, n, ()=>[{ diam:4, side:0, vert:4 }]); // at least one pipe
  }
  syncArrays();

/* ────────────────────────────────────────────────────────
   2 ◂ GUI root
   ──────────────────────────────────────────────────────── */
  const gui = new GUI({ width: 380 });
  gui.add({ logCamera(){
    console.log(`camera.position.set(${camera.position.x.toFixed(3)}, ${camera.position.y.toFixed(3)}, ${camera.position.z.toFixed(3)});`);
    console.log(`controls.target.set(${controls.target.x.toFixed(3)}, ${controls.target.y.toFixed(3)}, ${controls.target.z.toFixed(3)}); controls.update();`);
  }}, 'logCamera').name('⇢ Log camera');

/* ────────────────────────────────────────────────────────
   3 ◂ scene rebuild
   ──────────────────────────────────────────────────────── */
  let rackObj, shellObj, ductGroup, pipeGroup;

  function rebuildScene(){
    if (rackObj)   { dispose(rackObj);   scene.remove(rackObj); }
    if (shellObj)  { dispose(shellObj);  scene.remove(shellObj);}
    if (ductGroup) { dispose(ductGroup); scene.remove(ductGroup);}
    if (pipeGroup) { dispose(pipeGroup); scene.remove(pipeGroup);}

    rackObj  = buildRack(p, steelMat);
    shellObj = buildShell(p, wallMaterial, ceilingMaterial, floorMaterial, roofMaterial);

    /* ducts */
    ductGroup = new THREE.Group();
    p.ductEnabled.forEach((en,i)=>{
      if (!en) return;
      ductGroup.add(buildDuct({
        ...p,
        ductTier   : i+1,
        ductWidth  : p.ductWidths [i],
        ductHeight : p.ductHeights[i],
        ductOffset : p.ductOffsets[i]
      }, ductMat));
    });

    /* pipes */
    pipeGroup = new THREE.Group();
    p.pipeEnabled.forEach((en,i)=>{
      if (!en) return;
      pipeGroup.add(
        buildPipesFlexible(p, i+1, p.pipesPerTier[i], pipeMat)
      );
    });

    scene.add(shellObj, rackObj, ductGroup, pipeGroup);
  }

/* ────────────────────────────────────────────────────────
   4 ◂ helpers for limits
   ──────────────────────────────────────────────────────── */
  let depthCtrl, topCtrl;                 // filled later

  const sideLimit = diamIn =>
    ft2in(p.depth)/2 - p.postSize/2 - diamIn/2;

  function refreshTierLimits(tIdx){
    /* duct */
    if (p.ductEnabled[tIdx]){
      const hMax = Math.max(1, ft2in(tierHeightFt(p, tIdx+1)));
      ductCtrls[tIdx].h.max(hMax).updateDisplay();
      p.ductHeights[tIdx] = Math.min(p.ductHeights[tIdx], hMax);

      const wMax = Math.max(1, ft2in(p.depth) - p.postSize);
      ductCtrls[tIdx].w.max(wMax).updateDisplay();
      p.ductWidths[tIdx] = Math.min(p.ductWidths[tIdx], wMax);

      const lim = sideLimit(p.ductWidths[tIdx]);
      ductCtrls[tIdx].o.min(-lim).max(lim).updateDisplay();
      p.ductOffsets[tIdx] = THREE.MathUtils.clamp(p.ductOffsets[tIdx], -lim, lim);
    }

    /* each pipe in this tier */
    if (p.pipeEnabled[tIdx]){
      p.pipesPerTier[tIdx].forEach((pipeObj, j)=>{
        if (!pipeCtrls[tIdx] || !pipeCtrls[tIdx][j]) return;
        const pc = pipeCtrls[tIdx][j];
        const lim = sideLimit(pipeObj.diam);
        pc.o.min(-lim).max(lim).updateDisplay();
        pipeObj.side = THREE.MathUtils.clamp(pipeObj.side, -lim, lim);

        const vMax = Math.max(1, ft2in(tierHeightFt(p, tIdx+1)));
        pc.v.max(vMax).updateDisplay();
        pipeObj.vert = Math.min(pipeObj.vert, vMax);
      });
    }
  }

  function updateGlobals(){
    /* top-clearance */
    const minTop = Math.max(1, p.corridorHeight - p.ceilingHeight);
    const maxTop = p.corridorHeight;
    topCtrl.min(minTop).max(maxTop).updateDisplay();
    p.topClearance = THREE.MathUtils.clamp(p.topClearance, minTop, maxTop);

    /* depth */
    depthCtrl.max(p.corridorWidth).updateDisplay();
    p.depth = Math.min(p.depth, p.corridorWidth);

    tierFolders.forEach((_,i)=>refreshTierLimits(i));
  }

/* ────────────────────────────────────────────────────────
   5 ◂ global sliders
   ──────────────────────────────────────────────────────── */
  gui.add(p,'corridorWidth',6,40).name('Corridor width (ft)').onFinishChange(()=>{updateGlobals();rebuildScene();});
  gui.add(p,'corridorHeight',8,60).name('Corridor height (ft)').onFinishChange(()=>{updateGlobals();rebuildScene();});
  gui.add(p,'ceilingHeight',0,p.corridorHeight).name('Ceiling height (ft)').onFinishChange(()=>{updateGlobals();rebuildScene();});
  gui.add(p,'bayCount',1,10,1).name('Bay count').onFinishChange(rebuildScene);
  gui.add(p,'bayWidth',1,30).name('Bay width (ft)').onFinishChange(rebuildScene);

  depthCtrl = gui.add(p,'depth',1,p.corridorWidth).name('Rack depth (ft)').onFinishChange(()=>{updateGlobals();rebuildScene();});
  topCtrl   = gui.add(p,'topClearance',1,p.corridorHeight).name('Top clearance (ft)').onFinishChange(rebuildScene);

  gui.add(p,'postSize',0.5,12).name('Post size (in)').onFinishChange(()=>{updateGlobals();rebuildScene();});
  gui.add(p,'beamSize',0.5,12).name('Beam size (in)').onFinishChange(()=>{updateGlobals();rebuildScene();});

  gui.add(p,'tierCount',1,10,1).name('Tier count').onFinishChange(v=>{
    syncArrays();
    buildTierFolders();
    rebuildScene();
  });

/* ────────────────────────────────────────────────────────
   6 ◂ tier folders
   ──────────────────────────────────────────────────────── */
  let tierFolders = [];              // GUI folder refs
  let ductCtrls   = [];              // per-tier {w,h,o}
  let pipeCtrls   = [];              // per-tier [ {d,o,v}, … ]

  function buildTierFolders(){
    /* clean out old folders */
    tierFolders.forEach(f=>f.destroy());
    tierFolders = [];
    ductCtrls   = [];
    pipeCtrls   = [];

    p.tierHeights.forEach((_,tIdx)=>{
      const tf = gui.addFolder(`Tier ${tIdx+1}`);
      tierFolders[tIdx]=tf;

      /* height slider */
      tf.add(p.tierHeights, tIdx.toString(), 1, 6)
        .name('Height (ft)').onFinishChange(()=>{ refreshTierLimits(tIdx); rebuildScene(); });

      /* ───── duct toggle + folder ───── */
      tf.add(p.ductEnabled, tIdx.toString()).name('Has duct')
        .onChange(()=>{ buildTierFolders(); rebuildScene(); });

      let dW,dH,dO;
      if (p.ductEnabled[tIdx]){
        const df = tf.addFolder('Duct');

        dW = df.add(p.ductWidths, tIdx.toString(), 4, 48).name('Width (in)')
              .onFinishChange(()=>{ refreshTierLimits(tIdx); rebuildScene(); });

        dH = df.add(p.ductHeights,tIdx.toString(), 4, 48).name('Height (in)')
              .onFinishChange(rebuildScene);

        const lim = sideLimit(p.ductWidths[tIdx]);
        dO = df.add(p.ductOffsets,tIdx.toString(), -lim, lim).name('Side offset (in)')
              .onFinishChange(rebuildScene);

        df.open(false);
      }
      ductCtrls[tIdx] = { w:dW,h:dH,o:dO };

      /* ───── pipe toggle + folder ───── */
      tf.add(p.pipeEnabled, tIdx.toString()).name('Has pipes')
        .onChange(()=>{ buildTierFolders(); rebuildScene(); });

      pipeCtrls[tIdx] = [];

      if (p.pipeEnabled[tIdx]){
        const pf = tf.addFolder('Pipes');

        /* count spinner modifies array length */
        pf.add({cnt:p.pipesPerTier[tIdx].length},'cnt')   // ← just a number box
          .step(1)                                        // up/down arrows
          .name('Count')
          .onChange(n=>{
            const arr = p.pipesPerTier[tIdx];
            while(arr.length < n) arr.push({ diam:4, side:0, vert:4 });
            arr.length = n;
            buildTierFolders();
            rebuildScene();
          });

        /* one sub-folder per pipe */
        p.pipesPerTier[tIdx].forEach((pipeObj, pIdx)=>{
          const sub = pf.addFolder(`Pipe ${pIdx+1}`);

          const dC = sub.add(pipeObj,'diam',1,24).name('Diameter (in)')
                      .onFinishChange(() => {
                        refreshTierLimits(tIdx);
                        // 👇 Recalculate and update vert offset limit
                        const vMaxNew = Math.max(1, ft2in(tierHeightFt(p, tIdx+1)) - pipeObj.diam);
                        vC.max(vMaxNew).updateDisplay();
                        rebuildScene();
                    });

          const lim = sideLimit(pipeObj.diam);
          const oC = sub.add(pipeObj,'side',-lim,lim).name('Side offset (in)')
                        .onFinishChange(rebuildScene);

          const vMax = Math.max(1, ft2in(tierHeightFt(p, tIdx+1)) - pipeObj.diam);
          const vC = sub.add(pipeObj,'vert',0,vMax).name('Vert offset (in)')
                      .onFinishChange(rebuildScene);

          pipeCtrls[tIdx][pIdx] = { d:dC, o:oC, v:vC };
          sub.open(false);
        });

        pf.open(false);
      }

      tf.open(false);
    });
  }

/* ────────────────────────────────────────────────────────
   7 ◂ initial rollout
   ──────────────────────────────────────────────────────── */
  buildTierFolders();
  updateGlobals();
  rebuildScene();
}
