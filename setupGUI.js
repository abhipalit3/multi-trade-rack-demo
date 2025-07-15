// setupGUI.js

import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.19/+esm';
import * as THREE from 'three';
import {
  ft2in,
  tierHeightFt,
  dispose,
  buildRack,
  buildShell,
  buildDuct,
  buildPipesFlexible
} from './utils.js';

// Exported handles
export let controllerMap = {};
let sceneRef, matsRef, pRef;

// Top-level entrypoint: call this once in main.js
export function setupGUI(scene, p, camera, controls, mats) {
  // Keep refs for inner functions
  sceneRef = scene;
  matsRef  = mats;
  pRef     = p;

  // Ensure per-tier arrays exist and match initial tierCount
  ensureArrays(pRef);
  syncArrays(pRef);

  // Create the GUI
  const gui = new GUI({ width: 380 });

  // Build and wire all components
  buildControllers(gui, pRef, camera, controls);
  buildTierFolders(gui, pRef);
  clampGlobals(pRef);
  const rebuildScene = buildSceneRebuilder(sceneRef, pRef, matsRef);

  // Initial render
  rebuildScene();

  // Return callback for external code
  return rebuildScene;
}

/**
 * Ensures all p[...] arrays exist.
 */
function ensureArrays(p) {
  ['tierHeights','ductEnabled','ductWidths','ductHeights','ductOffsets','pipeEnabled','pipesPerTier']
    .forEach(key => { if (!Array.isArray(p[key])) p[key] = []; });
}

/**
 * Grows or shrinks p[...] arrays to match p.tierCount.
 */
function syncArrays(p) {
  const n = p.tierCount;
  while (p.tierHeights.length < n) p.tierHeights.push(2);
  p.tierHeights.length = n;

  ['ductEnabled','ductWidths','ductHeights','ductOffsets','pipeEnabled'].forEach(key => {
    while (p[key].length < n) p[key].push(key==='ductEnabled'||key==='pipeEnabled'?false:18);
    p[key].length = n;
  });

  while (p.pipesPerTier.length < n) p.pipesPerTier.push([{ diam:4, side:0, vert:4 }]);
  p.pipesPerTier.length = n;
}

/**
 * Builds the rack+shell+ducts+pipes and returns a function to rebuild on demand.
 */
function buildSceneRebuilder(scene, p, mats) {
  return function rebuildScene() {
    // Dispose previous
    scene.children.slice().forEach(o => {
      if (o.userData.generated) {
        dispose(o);
        scene.remove(o);
      }
    });

    // Rack & shell
    const rack  = buildRack(p, mats.steelMat);
    const shell = buildShell(p, mats.wallMaterial, mats.ceilingMaterial, mats.floorMaterial, mats.roofMaterial);
    [rack, shell].forEach(g => {
      g.userData.generated = true;
      scene.add(g);
    });

    // Ducts
    const dg = new THREE.Group(); dg.userData.generated = true;
    p.ductEnabled.forEach((en,i) => {
      if (en) dg.add(buildDuct({
        ...p,
        ductTier:   i+1,
        ductWidth:  p.ductWidths[i],
        ductHeight: p.ductHeights[i],
        ductOffset: p.ductOffsets[i]
      }, mats.ductMat));
    });
    scene.add(dg);

    // Pipes
    const pg = new THREE.Group(); pg.userData.generated = true;
    p.pipeEnabled.forEach((en,i) => {
      if (en) pg.add(buildPipesFlexible(p, i+1, p.pipesPerTier[i],
        new THREE.MeshStandardMaterial({ color:'#4eadff', metalness:0.3, roughness:0.6 })
      ));
    });
    scene.add(pg);
  };
}

/**
 * Creates top-level controllers and stores them in controllerMap.
 */
function buildControllers(gui, p, camera, controls) {
  controllerMap.corridorWidth = gui
    .add(p, 'corridorWidth', 6, 40)
    .name('Corridor width (ft)')
    .onFinishChange(() => { clampGlobals(p); controllerMap._rebuildScene(); });

  controllerMap.corridorHeight = gui
    .add(p, 'corridorHeight', 8, 60)
    .name('Corridor height (ft)')
    .onFinishChange(() => { clampGlobals(p); controllerMap._rebuildScene(); });

  controllerMap.ceilingHeight = gui
    .add(p, 'ceilingHeight', 0, p.corridorHeight)
    .name('Ceiling height (ft)')
    .onFinishChange(() => { clampGlobals(p); controllerMap._rebuildScene(); });

  controllerMap.bayCount = gui
    .add(p, 'bayCount', 1, 10, 1)
    .name('Bay count')
    .onFinishChange(controllerMap._rebuildScene);

  controllerMap.bayWidth = gui
    .add(p, 'bayWidth', 1, 30)
    .name('Bay width (ft)')
    .onFinishChange(controllerMap._rebuildScene);

  controllerMap.depth = gui
    .add(p, 'depth', 1, p.corridorWidth)
    .name('Rack depth (ft)')
    .onFinishChange(() => { clampGlobals(p); controllerMap._rebuildScene(); });

  controllerMap.topClearance = gui
    .add(p, 'topClearance', 1, p.corridorHeight)
    .name('Top clearance (ft)')
    .onFinishChange(controllerMap._rebuildScene);

  controllerMap.postSize = gui
    .add(p, 'postSize', 0.5, 12)
    .name('Post size (in)')
    .onFinishChange(() => { clampGlobals(p); controllerMap._rebuildScene(); });

  controllerMap.beamSize = gui
    .add(p, 'beamSize', 0.5, 12)
    .name('Beam size (in)')
    .onFinishChange(() => { clampGlobals(p); controllerMap._rebuildScene(); });

  // tierCount needs to rebuild folders and scene
  controllerMap.tierCount = gui
    .add(p, 'tierCount', 1, 10, 1)
    .name('Tier count')
    .onFinishChange(v => {
      syncArrays(p);
      buildTierFolders(gui, p);
      clampGlobals(p);
      controllerMap._rebuildScene();
    });
}

/**
 * Builds (or rebuilds) all per-tier GUI folders.
 */
function buildTierFolders(gui, p) {
  // Remove old
  if (controllerMap._tierFolders) {
    controllerMap._tierFolders.forEach(f => f.destroy());
  }
  const folders = [];
  const ductCtrls = [];
  const pipeCtrls = [];

  for (let t = 0; t < p.tierCount; t++) {
    const tf = gui.addFolder(`Tier ${t+1}`);
    folders.push(tf);

    // Tier height
    tf.add(p.tierHeights, t.toString(), 1, 6)
      .name('Height (ft)')
      .onFinishChange(() => { refreshTierLimits(t); controllerMap._rebuildScene(); });

    // Duct toggle
    tf.add(p.ductEnabled, t.toString())
      .name('Has duct')
      .onChange(() => { buildTierFolders(gui,p); controllerMap._rebuildScene(); });

    let dW, dH, dO;
    if (p.ductEnabled[t]) {
      const df = tf.addFolder('Duct');
      dW = df.add(p.ductWidths,  t.toString(), 4, 48)
              .name('Width (in)')
              .onFinishChange(() => { refreshTierLimits(t); controllerMap._rebuildScene(); });
      dH = df.add(p.ductHeights, t.toString(), 4, 48)
              .name('Height (in)')
              .onFinishChange(() => { controllerMap._rebuildScene(); });
      const lim = ft2in(p.depth)/2 - p.postSize/2 - p.ductWidths[t]/2;
      dO = df.add(p.ductOffsets, t.toString(), -lim, lim)
              .name('Side offset (in)')
              .onFinishChange(() => { controllerMap._rebuildScene(); });
      df.open(false);
    }
    ductCtrls[t] = { w:dW, h:dH, o:dO };

    // Pipe toggle
    tf.add(p.pipeEnabled, t.toString())
      .name('Has pipes')
      .onChange(() => { buildTierFolders(gui,p); controllerMap._rebuildScene(); });

    pipeCtrls[t] = [];
    if (p.pipeEnabled[t]) {
      const pf = tf.addFolder('Pipes');
      pf.add({cnt: p.pipesPerTier[t].length}, 'cnt')
        .step(1)
        .name('Count')
        .onChange(n => {
          const arr = p.pipesPerTier[t];
          while (arr.length < n) arr.push({diam:4,side:0,vert:4});
          arr.length = n;
          buildTierFolders(gui,p);
          controllerMap._rebuildScene();
        });
      p.pipesPerTier[t].forEach((o,j) => {
        const sub = pf.addFolder(`Pipe ${j+1}`);
        const dC = sub.add(o, 'diam',1,24).name('Diameter (in)')
                   .onFinishChange(() => { refreshTierLimits(t); controllerMap._rebuildScene(); });
        const lim = ft2in(p.depth)/2 - p.postSize/2 - o.diam/2;
        const oC = sub.add(o, 'side', -lim,lim). name('Side offset (in)').onFinishChange(controllerMap._rebuildScene);
        const vMax = Math.max(1, ft2in(tierHeightFt(p,t+1)));
        const vC = sub.add(o, 'vert',0,vMax).name('Vert offset (in)').onFinishChange(controllerMap._rebuildScene);
        pipeCtrls[t][j] = {d:dC,o:oC,v:vC};
        sub.open(false);
      });
      pf.open(false);
    }

    tf.open(false);
  }

  controllerMap._tierFolders = folders;
}

/**
 * Clamp the global sliders to their valid ranges.
 */
function clampGlobals(p) {
  const minTop = Math.max(1, p.corridorHeight - p.corridorHeight);
  const maxTop = p.corridorHeight;
  controllerMap.topClearance.min(minTop).max(maxTop).updateDisplay();
  p.topClearance = THREE.MathUtils.clamp(p.topClearance, minTop, maxTop);

  controllerMap.depth.max(p.corridorWidth).updateDisplay();
  p.depth = Math.min(p.depth, p.corridorWidth);
}
