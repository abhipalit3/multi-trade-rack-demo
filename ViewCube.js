// ViewCube.js
import * as THREE from 'three';

function createLabelMaterial(label) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ccc';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000';
  ctx.font = 'bold 32px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, size / 2, size / 2);
  const texture = new THREE.CanvasTexture(canvas);
  return new THREE.MeshBasicMaterial({ map: texture });
}

export class ViewCube extends THREE.Mesh {
  constructor(size = 1) {
    const geometry = new THREE.BoxGeometry(size, size, size);
    const materials = [
      createLabelMaterial('RIGHT'),   // +X
      createLabelMaterial('LEFT'),    // -X
      createLabelMaterial('TOP'),     // +Y
      createLabelMaterial('BOTTOM'),  // -Y
      createLabelMaterial('BACK'),    // -Z is visually front-facing
      createLabelMaterial('FRONT')    // +Z is visually back-facing
    ];
    super(geometry, materials);
  }
}
