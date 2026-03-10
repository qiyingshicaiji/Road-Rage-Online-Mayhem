/**
 * Input - Keyboard input handling for driver and passenger controls
 */

class InputManager {
    constructor() {
        this.keys = {};
        this.attackQueued = AttackType.NONE;
        this.role = PlayerRole.DRIVER;

        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => this.onKeyUp(e));
    }

    onKeyDown(e) {
        this.keys[e.code] = true;

        // Queue attacks (passenger controls)
        if (this.role === PlayerRole.PASSENGER) {
            if (e.code === 'Digit1' || e.code === 'Numpad1') {
                this.attackQueued = AttackType.KICK;
            } else if (e.code === 'Digit2' || e.code === 'Numpad2') {
                this.attackQueued = AttackType.BRAKE_GRAB;
            } else if (e.code === 'Digit3' || e.code === 'Numpad3') {
                this.attackQueued = AttackType.SMASH;
            }
        }
    }

    onKeyUp(e) {
        this.keys[e.code] = false;
    }

    isPressed(code) {
        return !!this.keys[code];
    }

    // Get current input frame based on role
    getInputFrame(nearestEnemyId) {
        const frame = {
            throttle: 0,
            steering: 0,
            brake: false,
            attack: AttackType.NONE,
            targetId: 0,
        };

        if (this.role === PlayerRole.DRIVER) {
            // W/ArrowUp = throttle
            if (this.isPressed('KeyW') || this.isPressed('ArrowUp')) {
                frame.throttle = 255;
            }

            // S/ArrowDown = brake
            if (this.isPressed('KeyS') || this.isPressed('ArrowDown')) {
                frame.brake = true;
            }

            // A/ArrowLeft = steer left, D/ArrowRight = steer right
            if (this.isPressed('KeyA') || this.isPressed('ArrowLeft')) {
                frame.steering = -100;
            } else if (this.isPressed('KeyD') || this.isPressed('ArrowRight')) {
                frame.steering = 100;
            }
        } else if (this.role === PlayerRole.PASSENGER) {
            // Passenger attack controls
            if (this.attackQueued !== AttackType.NONE) {
                frame.attack = this.attackQueued;
                frame.targetId = nearestEnemyId || 0;
                this.attackQueued = AttackType.NONE;
            }
        }

        return frame;
    }

    setRole(role) {
        this.role = role;
    }
}
