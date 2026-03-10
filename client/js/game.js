/**
 * Game - Client-side game state management and prediction
 */

class GameState {
    constructor() {
        this.vehicles = [];
        this.myPlayerId = 0;
        this.myVehicleId = 0;
        this.myRole = PlayerRole.DRIVER;
        this.roomId = 0;
        this.playing = false;
        this.tick = 0;
        this.lastSnapshotTime = 0;

        // Track config
        this.track = {
            length: 2000,
            width: 12,
            lane_width: 3,
            num_laps: 3,
        };

        // Client-side prediction
        this.pendingInputs = [];
    }

    // Process a snapshot from the server
    applySnapshot(reader) {
        const tick = reader.readU32();
        const vehicleCount = reader.readU8();

        this.tick = tick;
        this.lastSnapshotTime = performance.now();

        const newVehicles = [];
        for (let i = 0; i < vehicleCount; i++) {
            const v = {
                vehicle_id: reader.readU32(),
                pos_x: reader.readFloat(),
                pos_y: reader.readFloat(),
                angle: reader.readFloat(),
                speed: reader.readFloat(),
                balance: reader.readFloat(),
                driver_id: reader.readU32(),
                passenger_id: reader.readU32(),
            };

            // Calculate distance from position for minimap
            v.distance = Math.max(0, v.pos_x - 50);

            // Smooth interpolation from previous state
            const prev = this.vehicles.find(pv => pv.vehicle_id === v.vehicle_id);
            if (prev) {
                // Interpolate for smooth rendering (except our own vehicle - use prediction)
                if (v.vehicle_id !== this.myVehicleId) {
                    v.render_x = prev.render_x + (v.pos_x - prev.render_x) * 0.3;
                    v.render_y = prev.render_y + (v.pos_y - prev.render_y) * 0.3;
                    v.render_angle = prev.render_angle + normalizeAngle(v.angle - prev.render_angle) * 0.3;
                } else {
                    v.render_x = v.pos_x;
                    v.render_y = v.pos_y;
                    v.render_angle = v.angle;
                }
            } else {
                v.render_x = v.pos_x;
                v.render_y = v.pos_y;
                v.render_angle = v.angle;
            }

            newVehicles.push(v);

            // Identify our vehicle
            if (v.driver_id === this.myPlayerId || v.passenger_id === this.myPlayerId) {
                this.myVehicleId = v.vehicle_id;
                this.myRole = v.driver_id === this.myPlayerId ? PlayerRole.DRIVER : PlayerRole.PASSENGER;
            }
        }

        this.vehicles = newVehicles;
    }

    // Client-side prediction: advance vehicle state locally
    predictLocal(input, dt) {
        const myVehicle = this.getMyVehicle();
        if (!myVehicle || this.myRole !== PlayerRole.DRIVER) return;

        const throttleNorm = input.throttle / 255;
        const steeringNorm = input.steering / 127;
        const accel = 15.0;
        const brakeDecel = 25.0;
        const friction = 3.0;
        const maxSpeed = 30.0;
        const steerSens = 2.5;

        let speed = myVehicle.speed;
        let angle = myVehicle.render_angle;

        if (throttleNorm > 0 && !input.brake) {
            speed += accel * throttleNorm * dt;
        }
        if (input.brake) {
            speed -= brakeDecel * dt;
            if (speed < 0) speed = 0;
        }
        if (speed > 0) {
            speed -= friction * dt;
            if (speed < 0) speed = 0;
        }
        speed = Math.min(speed, maxSpeed);

        if (speed > 0.5) {
            const balanceFactor = myVehicle.balance / 100;
            angle += steeringNorm * steerSens * balanceFactor * dt;
        }

        myVehicle.render_x += Math.cos(angle) * speed * dt;
        myVehicle.render_y += Math.sin(angle) * speed * dt;
        myVehicle.render_angle = angle;
        myVehicle.speed = speed;
    }

    getMyVehicle() {
        return this.vehicles.find(v => v.vehicle_id === this.myVehicleId) || null;
    }

    // Get nearest enemy vehicle for targeting
    getNearestEnemy() {
        const my = this.getMyVehicle();
        if (!my) return null;

        let nearest = null;
        let nearestDist = Infinity;

        for (const v of this.vehicles) {
            if (v.vehicle_id === this.myVehicleId) continue;
            const dx = v.pos_x - my.pos_x;
            const dy = v.pos_y - my.pos_y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearest = v;
            }
        }
        return nearest;
    }

    reset() {
        this.vehicles = [];
        this.playing = false;
        this.tick = 0;
        this.myVehicleId = 0;
    }
}

function normalizeAngle(a) {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
}
