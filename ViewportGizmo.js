// ViewportGizmo.js
import * as THREE from 'three';

export class ViewportGizmo {
  constructor(mainCamera, renderer) {
    this.renderer = renderer;
    this.mainCamera = mainCamera;

    this.size = 100;
    this.viewport = { x: 10, y: 10, width: this.size, height: this.size };

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
    this.camera.up.copy(mainCamera.up);

    this.axesHelper = new THREE.AxesHelper(0.5);
    this.scene.add(this.axesHelper);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
  }

  render() {
    const dir = new THREE.Vector3();
    this.mainCamera.getWorldDirection(dir);
    this.camera.position.copy(dir).multiplyScalar(2);
    this.camera.lookAt(this.scene.position);

    this.renderer.clearDepth();
    this.renderer.setScissorTest(true);
    this.renderer.setScissor(
      this.viewport.x,
      this.viewport.y,
      this.viewport.width,
      this.viewport.height
    );
    this.renderer.setViewport(
      this.viewport.x,
      this.viewport.y,
      this.viewport.width,
      this.viewport.height
    );
    this.renderer.render(this.scene, this.camera);
    this.renderer.setScissorTest(false);
  }

  onClick(x, y) {
    const { x: vx, y: vy, width, height } = this.viewport;
    if (
      x >= vx &&
      y >= vy &&
      x <= vx + width &&
      y <= vy + height
    ) {
      this.pointer.set(
        ((x - vx) / width) * 2 - 1,
        -((y - vy) / height) * 2 + 1
      );
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const intersects = this.raycaster.intersectObject(this.axesHelper, true);
      if (intersects.length > 0) {
        console.log('Gizmo clicked:', intersects[0].point);
        return true;
      }
    }
    return false;
  }
}
