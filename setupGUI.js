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

export let guiInstance = null;
export let controllerMap = {};

/**
 * Ensure that all per-tier arrays exist on `p`.
 */
function ensureArrays(p) {
  if (!Array.isArray(p.tierHeights))  p.tierHeights  = [];
  if (!Array.isArray(p.ductEnabled))  p.ductEnabled  = [];
  if (!Array.isArray(p.ductWidths))   p.ductWidths   = [];
  if (!Array.isArray(p.ductHeights))  p.ductHeights  = [];
  if (!Array.isArray(p.ductOffsets))  p.ductOffsets  = [];
  if (!Array.isArray(p.pipeEnabled))  p.pipeEnabled  = [];
  if (!Array.isArray(p.pipesPerTier)) p.pipesPerTier = [];
}

/**
 * Resize or trim per-tier arrays to exactly `p.tierCount` entries.
 */
function syncArrays(p) {
  const n = p.tierCount;
  while (p.tierHeights.length < n)  p.tierHeights.push(2);
  p.tierHeights.length = n;

  while (p.ductEnabled.length < n)  p.ductEnabled.push(false);
  while (p.ductWidths .length < n)  p.ductWidths .push(18);
  while (p.ductHeights.length < n)  p.ductHeights.push(16);
  while (p.ductOffsets.length < n)  p.ductOffsets.push(0);
  p.ductEnabled.length = p.ductWidths.length = p.ductHeights.length = p.ductOffsets.length = n;

  while (p.pipeEnabled.length < n)  p.pipeEnabled.push(false);
  while (p.pipesPerTier.length < n) p.pipesPerTier.push([{ diam:4, side:0, vert:4 }]);
  p.pipeEnabled.length = p.pipesPerTier.length = n;
}

/**
 * The main entrypoint. Call once from your main.js.
 * Returns a `rebuildScene()` callback which you can also pass to your chat interface.
 */
export function setupGUI(scene, params, camera, controls, mats) {
  // 1) GUI root
  guiInstance = new GUI({ width: 380 });
  const gui = guiInstance;

  // 2) Guarantee data-model
  ensureArrays(params);
  syncArrays(params);

  // 3) Tier‐folder builder (recreated on every tierCount change)
  let tiersFolder = null;
  function buildTierUI() {
    if (tiersFolder) tiersFolder.destroy();
    tiersFolder = gui.addFolder('Tiers');

    const n = params.tierCount;
    // syncArrays has already run, so arrays are length n
    for (let i = 0; i < n; i++) {
      const tf = tiersFolder.addFolder(`Tier ${i+1}`);

      // Height slider
      controllerMap[`tierHeight_${i}`] = tf
        .add(params.tierHeights, i, 1, 6)
        .name('Height (ft)')
        .onChange(rebuildScene);

      // Duct toggle
      controllerMap[`ductEnabled_${i}`] = tf
        .add(params.ductEnabled, i)
        .name('Has duct')
        .onChange(rebuildScene);

      // Pipes toggle
      controllerMap[`pipeEnabled_${i}`] = tf
        .add(params.pipeEnabled, i)
        .name('Has pipes')
        .onChange(rebuildScene);

      tf.open();
    }
    tiersFolder.open();
  }

  // 4) 3D rebuild function
  function rebuildScene() {
    // dispose old generated
    scene.children.slice().forEach(o => {
      if (o.userData.isGenerated) {
        dispose(o);
        scene.remove(o);
      }
    });

    // rack + shell
    const rackObj  = buildRack(params, mats.steelMat);
    const shellObj = buildShell(
      params,
      mats.wallMaterial,
      mats.ceilingMaterial,
      mats.floorMaterial,
      mats.roofMaterial
    );
    [rackObj, shellObj].forEach(g => {
      g.userData.isGenerated = true;
      scene.add(g);
    });

    // ducts
    const ductGroup = new THREE.Group();
    ductGroup.userData.isGenerated = true;
    params.ductEnabled.forEach((en, i) => {
      if (!en) return;
      ductGroup.add(buildDuct({
        ...params,
        ductTier:   i+1,
        ductWidth:  params.ductWidths[i],
        ductHeight: params.ductHeights[i],
        ductOffset: params.ductOffsets[i]
      }, mats.ductMat));
    });
    scene.add(ductGroup);

    // pipes
    const pipeGroup = new THREE.Group();
    pipeGroup.userData.isGenerated = true;
    params.pipeEnabled.forEach((en, i) => {
      if (!en) return;
      pipeGroup.add(buildPipesFlexible(
        params, i+1, params.pipesPerTier[i],
        new THREE.MeshStandardMaterial({ color:'#4eadff', metalness:0.3, roughness:0.6 })
      ));
    });
    scene.add(pipeGroup);
  }

  // 5) Expose rebuildScene for controllers & chat
  controllerMap._rebuildScene = rebuildScene;

  // 6) Top‐level controllers
  controllerMap.corridorWidth = gui
    .add(params, 'corridorWidth', 6, 40)
    .name('Corridor width (ft)')
    .onChange(rebuildScene);

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
    .onChange(rebuildScene);

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
    .onChange(v => {
      // whenever number of tiers changes:
      syncArrays(params);    // adjust arrays to new length
      buildTierUI();         // rebuild the "Tiers" folder
      rebuildScene();        // rebuild geometry
    });

  // 7) initial build
  buildTierUI();
  rebuildScene();

  // 8) return for external use
  return rebuildScene;
}
