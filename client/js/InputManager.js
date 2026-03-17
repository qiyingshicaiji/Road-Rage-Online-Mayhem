/**
 * InputManager - Handles keyboard input for driver and passenger
 */
class InputManager {
  constructor() {
    this.keys = {};
    this.attackQueue = [];

    document.addEventListener('keydown', (e) => this.onKeyDown(e));
    document.addEventListener('keyup', (e) => this.onKeyUp(e));
  }

  onKeyDown(e) {
    if (this.keys[e.code]) return;
    this.keys[e.code] = true;

    // Attack keys (trigger on press)
    switch (e.code) {
      case 'KeyJ':
        this.attackQueue.push('kick');
        break;
      case 'KeyK':
        this.attackQueue.push('brake_pinch');
        break;
      case 'KeyL':
        this.attackQueue.push('weapon');
        break;
    }
  }

  onKeyUp(e) {
    this.keys[e.code] = false;
  }

  getInput() {
    const input = {
      throttle: 0,
      brake: 0,
      steer: 0,
      attack: null,
    };

    // Driver controls (WASD or Arrow keys)
    if (this.keys['KeyW'] || this.keys['ArrowUp']) input.throttle = 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) input.brake = 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) input.steer = -1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) input.steer = 1;

    // Consume one attack from queue
    if (this.attackQueue.length > 0) {
      input.attack = this.attackQueue.shift();
    }

    return input;
  }

  isAttackKeyDown(key) {
    switch (key) {
      case 'kick': return this.keys['KeyJ'];
      case 'brake_pinch': return this.keys['KeyK'];
      case 'weapon': return this.keys['KeyL'];
      default: return false;
    }
  }
}
