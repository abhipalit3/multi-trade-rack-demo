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

export let guiInstance = null;
export let controllerMap = {};

/** Ensure per-tier arrays exist */
function ensureArrays(p) {
  if (!Array.isArray(p.tierHeights))  p.tierHeights  = [];
  if (!Array.isArray(p.ductEnabled))  p.ductEnabled  = [];
  if (!Array.isArray(p.ductWidths))   p.ductWidths   = [];
  if (!Array.isArray(p.ductHeights))  p.ductHeights  = [];
  if (!Array.isArray(p.ductOffsets))  p.ductOffsets  = [];
  if (!Array.isArray(p.pipeEnabled))  p.pipeEnabled  = [];
  if (!Array.isArray(p.pipesPerTier)) p.pipesPerTier = [];
}

/** Trim or grow per-tier arrays to match p.tierCount */
function syncArrays(p) {
  const n = p.tierCount;
  while (p.tierHeights .length < n) p.tierHeights .push(2);
  while (p.ductEnabled .length < n) p.ductEnabled .push(false);
  while (p.ductWidths  .length < n) p.ductWidths  .push(18);
  while (p.ductHeights .length < n) p.ductHeights .push(16);
  while (p.ductOffsets .length < n) p.ductOffsets .push(0);
  while (p.pipeEnabled .length < n) p.pipeEnabled .push(false);
  while (p.pipesPerTier.length < n) p.pipesPerTier.push([{ diam:4, side:0, vert:4 }]);
  p.tierHeights .length =
  p.ductEnabled .length =
  p.ductWidths  .length =
  p.ductHeights .length =
  p.ductOffsets .length =
  p.pipeEnabled .length =
  p.pipesPerTier.length = n;
}

export function setupGUI(scene, params, camera, controls, mats) {
  guiInstance = new GUI({ width: 380 });
  const gui = guiInstance;

  // 1) Ensure data‑model
  ensureArrays(params);
  syncArrays(params);

  // 2) Rebuild function
  function rebuildScene() {
    // dispose old
    scene.children.slice().forEach(o => {
      if (o.userData.isGenerated) {
        dispose(o);
        scene.remove(o);
      }
    });

    // rack + shell
    const rack  = buildRack(params, mats.steelMat);
    const shell = buildShell(params, mats.wallMaterial, mats.ceilingMaterial, mats.floorMaterial, mats.roofMaterial);
    [rack, shell].forEach(g => { g.userData.isGenerated = true; scene.add(g); });

    // ducts
    const dg = new THREE.Group(); dg.userData.isGenerated = true;
    params.ductEnabled.forEach((en,i) => {
      if (!en) return;
      dg.add(buildDuct({
        ...params,
        ductTier:   i+1,
        ductWidth:  params.ductWidths[i],
        ductHeight: params.ductHeights[i],
        ductOffset: params.ductOffsets[i]
      }, mats.ductMat));
    });
    scene.add(dg);

    // pipes
    const pg = new THREE.Group(); pg.userData.isGenerated = true;
    params.pipeEnabled.forEach((en,i) => {
      if (!en) return;
      pg.add(buildPipesFlexible(params, i+1, params.pipesPerTier[i],
        new THREE.MeshStandardMaterial({ color:'#4eadff', metalness:0.3, roughness:0.6 })
      ));
    });
    scene.add(pg);
  }

  // 3) Build Tiers UI
  let tiersFolder;
  function buildTierUI() {
    if (tiersFolder) tiersFolder.destroy();
    tiersFolder = gui.addFolder('Tiers');
    syncArrays(params);

    params.tierHeights.forEach((_, idx) => {
      const tf = tiersFolder.addFolder(`Tier ${idx+1}`);

      // Height
      controllerMap[`tierHeight_${idx}`] = tf
        .add(params.tierHeights, idx, 1, 6)
        .name('Height (ft)')
        .onChange(rebuildScene);

      // Duct toggle
      controllerMap[`ductEnabled_${idx}`] = tf
        .add(params.ductEnabled, idx)
        .name('Has duct')
        .onChange(() => { buildTierUI(); rebuildScene(); });

      // If duct enabled, show duct controls
      if (params.ductEnabled[idx]) {
        const df = tf.addFolder('Duct');
        controllerMap[`ductWidth_${idx}`] = df
          .add(params.ductWidths, idx, 4, 48)
          .name('Width (in)')
          .onChange(rebuildScene);
        controllerMap[`ductHeight_${idx}`] = df
          .add(params.ductHeights, idx, 4, 48)
          .name('Height (in)')
          .onChange(rebuildScene);
        controllerMap[`ductOffset_${idx}`] = df
          .add(params.ductOffsets, idx, -ft2in(params.depth)/2, ft2in(params.depth)/2)
          .name('Offset (in)')
          .onChange(rebuildScene);
        df.open();
      }

      // Pipe toggle
      controllerMap[`pipeEnabled_${idx}`] = tf
        .add(params.pipeEnabled, idx)
        .name('Has pipes')
        .onChange(() => { buildTierUI(); rebuildScene(); });

      // If pipes enabled, show pipes controls
      if (params.pipeEnabled[idx]) {
        const pf = tf.addFolder('Pipes');
        // Count
        pf.add({ count: params.pipesPerTier[idx].length }, 'count')
          .name('Count')
          .min(1)
          .step(1)
          .onChange(n => {
            const arr = params.pipesPerTier[idx];
            while (arr.length < n) arr.push({ diam:4, side:0, vert:4 });
            arr.length = n;
            buildTierUI();
            rebuildScene();
          });

        // Per-pipe controls
        params.pipesPerTier[idx].forEach((pipe, j) => {
          const sub = pf.addFolder(`Pipe ${j+1}`);
          controllerMap[`pipeDiam_${idx}_${j}`] = sub
            .add(pipe, 'diam', 1, 24)
            .name('Diameter (in)')
            .onChange(rebuildScene);
          controllerMap[`pipeSide_${idx}_${j}`] = sub
            .add(pipe, 'side', -ft2in(params.depth)/2, ft2in(params.depth)/2)
            .name('Side offset (in)')
            .onChange(rebuildScene);
          controllerMap[`pipeVert_${idx}_${j}`] = sub
            .add(pipe, 'vert', 0, ft2in(tierHeightFt(params, idx+1)))
            .name('Vert offset (in)')
            .onChange(rebuildScene);
          sub.open();
        });

        pf.open();
      }

      tf.open();
    });

    tiersFolder.open();
  }

  // 4) Top-level controls
  controllerMap.corridorWidth = gui
    .add(params, 'corridorWidth', 6, 40)
    .name('Corridor width (ft)')
    .onChange(val => {
      // update duct offset ranges
      syncArrays(params);
      buildTierUI();
      rebuildScene();
    });

  controllerMap.corridorHeight = gui
    .add(params, 'corridorHeight', 8, 60)
    .name('Corridor height (ft)')
    .onChange(rebuildScene);

  controllerMap.ceilingHeight = gui
    .add(params, 'ceilingHeight', 0, params.corridorHeight)
    .name('Ceiling height (ft)')
    .onChange(rebuildScene);

  controllerMap.bayCount = gui
    .add(params, 'bayCount', 1, 10, 1)
    .name('Bay count')
    .onChange(rebuildScene);

  controllerMap.bayWidth = gui
    .add(params, 'bayWidth', 1, 30)
    .name('Bay width (ft)')
    .onChange(rebuildScene);

  controllerMap.depth = gui
    .add(params, 'depth', 1, params.corridorWidth)
    .name('Rack depth (ft)')
    .onChange(val => {
      // re-sync duct/pipe offset limits
      syncArrays(params);
      buildTierUI();
      rebuildScene();
    });

  controllerMap.topClearance = gui
    .add(params, 'topClearance', 1, params.corridorHeight)
    .name('Top clearance (ft)')
    .onChange(rebuildScene);

  controllerMap.postSize = gui
    .add(params, 'postSize', 0.5, 12)
    .name('Post size (in)')
    .onChange(rebuildScene);

  controllerMap.beamSize = gui
    .add(params, 'beamSize', 0.5, 12)
    .name('Beam size (in)')
    .onChange(rebuildScene);

  controllerMap.tierCount = gui
    .add(params, 'tierCount', 1, 10, 1)
    .name('Tier count')
    .onChange(() => {
      syncArrays(params);
      buildTierUI();
      rebuildScene();
    });

  // 5) Initial build
  buildTierUI();
  rebuildScene();

  return rebuildScene;
}
