const { MsgType } = require('./protocol');

const TICK_RATE = 20; // 20 ticks per second
const TICK_INTERVAL = 1000 / TICK_RATE;

// Physics constants
const MAX_SPEED = 300;
const ACCELERATION = 200;
const BRAKE_FORCE = 400;
const FRICTION = 50;
const TURN_SPEED = 3.0;
const BALANCE_MAX = 100;
const BALANCE_RECOVERY = 5; // per second
const KICK_RANGE = 80;
const KICK_COST = 15;
const KICK_DAMAGE = 20;
const BRAKE_PINCH_RANGE = 70;
const BRAKE_PINCH_COST = 10;
const WEAPON_RANGE = 90;
const WEAPON_COST = 20;
const WEAPON_DAMAGE = 25;
const ARENA_WIDTH = 1600;
const ARENA_HEIGHT = 1200;

class GameEngine {
  constructor(room) {
    this.room = room;
    this.vehicles = new Map();
    this.projectiles = [];
    this.tickCount = 0;
    this.running = false;
    this.interval = null;
    this.lastTime = Date.now();
  }

  addVehicle(id, name, isAI = false) {
    const angle = Math.random() * Math.PI * 2;
    const spawnRadius = 350;
    const cx = ARENA_WIDTH / 2;
    const cy = ARENA_HEIGHT / 2;
    this.vehicles.set(id, {
      id,
      name,
      x: cx + Math.cos(angle) * spawnRadius,
      y: cy + Math.sin(angle) * spawnRadius,
      angle: angle + Math.PI, // face center
      speed: 0,
      balance: BALANCE_MAX,
      health: 100,
      score: 0,
      input: { throttle: 0, brake: 0, steer: 0, attack: null },
      stunTimer: 0,
      immuneTimer: 3, // 3 seconds of initial immunity
      isAI,
      aiState: 'pursue',
      aiTarget: null,
      aiTimer: 0,
      eliminated: false,
    });
  }

  removeVehicle(id) {
    this.vehicles.delete(id);
  }

  applyInput(id, input) {
    const v = this.vehicles.get(id);
    if (v) {
      v.input = { ...v.input, ...input };
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = Date.now();
    this.interval = setInterval(() => this.tick(), TICK_INTERVAL);
  }

  stop() {
    this.running = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  tick() {
    const now = Date.now();
    const dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    this.tickCount++;

    for (const v of this.vehicles.values()) {
      if (v.eliminated) continue;

      // Immunity timer countdown
      if (v.immuneTimer > 0) {
        v.immuneTimer -= dt;
      }

      // AI logic
      if (v.isAI) {
        this.updateAI(v, dt);
      }

      // Stun
      if (v.stunTimer > 0) {
        v.stunTimer -= dt;
        v.speed *= 0.95;
        continue;
      }

      // Steering
      if (v.speed !== 0) {
        const turnFactor = Math.min(1, Math.abs(v.speed) / 100);
        v.angle += v.input.steer * TURN_SPEED * turnFactor * dt;
      }

      // Acceleration / braking
      if (v.input.throttle > 0) {
        v.speed += ACCELERATION * v.input.throttle * dt;
      }
      if (v.input.brake > 0) {
        v.speed -= BRAKE_FORCE * v.input.brake * dt;
      }

      // Friction
      if (v.speed > 0) {
        v.speed = Math.max(0, v.speed - FRICTION * dt);
      } else if (v.speed < 0) {
        v.speed = Math.min(0, v.speed + FRICTION * dt);
      }

      // Clamp speed
      v.speed = Math.max(-MAX_SPEED * 0.3, Math.min(MAX_SPEED, v.speed));

      // Position update
      v.x += Math.cos(v.angle) * v.speed * dt;
      v.y += Math.sin(v.angle) * v.speed * dt;

      // Arena boundaries with bounce
      if (v.x < 30) { v.x = 30; v.speed *= -0.3; v.balance -= 5; }
      if (v.x > ARENA_WIDTH - 30) { v.x = ARENA_WIDTH - 30; v.speed *= -0.3; v.balance -= 5; }
      if (v.y < 30) { v.y = 30; v.speed *= -0.3; v.balance -= 5; }
      if (v.y > ARENA_HEIGHT - 30) { v.y = ARENA_HEIGHT - 30; v.speed *= -0.3; v.balance -= 5; }

      // Balance recovery
      if (!v.input.attack && v.stunTimer <= 0) {
        v.balance = Math.min(BALANCE_MAX, v.balance + BALANCE_RECOVERY * dt);
      }

      // Process attacks
      if (v.input.attack && v.balance > 0) {
        this.processAttack(v, v.input.attack);
        v.input.attack = null;
      }

      // Check elimination
      if (v.health <= 0) {
        v.eliminated = true;
        v.speed = 0;
      }
    }

    // Vehicle-vehicle collision
    this.checkCollisions();

    return this.getSnapshot();
  }

  processAttack(attacker, type) {
    let range, cost, damage;
    switch (type) {
      case 'kick':
        range = KICK_RANGE;
        cost = KICK_COST;
        damage = KICK_DAMAGE;
        break;
      case 'brake_pinch':
        range = BRAKE_PINCH_RANGE;
        cost = BRAKE_PINCH_COST;
        damage = 10;
        break;
      case 'weapon':
        range = WEAPON_RANGE;
        cost = WEAPON_COST;
        damage = WEAPON_DAMAGE;
        break;
      default:
        return;
    }

    if (attacker.balance < cost) return;
    attacker.balance -= cost;

    for (const target of this.vehicles.values()) {
      if (target.id === attacker.id || target.eliminated) continue;
      if (target.immuneTimer > 0) continue; // Skip immune targets

      const dx = target.x - attacker.x;
      const dy = target.y - attacker.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < range) {
        // Angle check: attack should be roughly facing target
        const angleToTarget = Math.atan2(dy, dx);
        let angleDiff = angleToTarget - attacker.angle;
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

        if (Math.abs(angleDiff) < Math.PI * 0.6) {
          target.health -= damage;
          target.balance -= damage * 0.5;

          if (type === 'kick') {
            // Knockback
            const knockAngle = Math.atan2(dy, dx);
            target.x += Math.cos(knockAngle) * 30;
            target.y += Math.sin(knockAngle) * 30;
            target.stunTimer = 0.3;
          } else if (type === 'brake_pinch') {
            target.speed *= 0.3;
            target.stunTimer = 0.5;
          } else if (type === 'weapon') {
            const knockAngle = Math.atan2(dy, dx);
            target.x += Math.cos(knockAngle) * 50;
            target.y += Math.sin(knockAngle) * 50;
            target.angle += (Math.random() - 0.5) * 0.5;
            target.stunTimer = 0.4;
          }

          attacker.score += damage;

          // Broadcast attack event
          this.room.broadcast({
            type: MsgType.ATTACK_EVENT,
            attackerId: attacker.id,
            targetId: target.id,
            attackType: type,
            damage,
          });
        }
      }
    }
  }

  checkCollisions() {
    const vehicles = Array.from(this.vehicles.values()).filter(v => !v.eliminated);
    for (let i = 0; i < vehicles.length; i++) {
      for (let j = i + 1; j < vehicles.length; j++) {
        const a = vehicles[i];
        const b = vehicles[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = 50;

        if (dist < minDist && dist > 0) {
          // Push apart
          const overlap = minDist - dist;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x -= nx * overlap * 0.5;
          a.y -= ny * overlap * 0.5;
          b.x += nx * overlap * 0.5;
          b.y += ny * overlap * 0.5;

          // Speed-based collision damage (skip if either is immune)
          const relSpeed = Math.abs(a.speed - b.speed);
          if (relSpeed > 100) {
            const dmg = Math.floor(relSpeed * 0.05);
            if (a.immuneTimer <= 0) { a.health -= dmg; a.balance -= dmg; }
            if (b.immuneTimer <= 0) { b.health -= dmg; b.balance -= dmg; }
          }
        }
      }
    }
  }

  updateAI(v, dt) {
    v.aiTimer -= dt;
    if (v.aiTimer <= 0) {
      v.aiTimer = 0.5 + Math.random() * 1.0;

      // Find closest non-eliminated player
      let closest = null;
      let closestDist = Infinity;
      for (const other of this.vehicles.values()) {
        if (other.id === v.id || other.eliminated) continue;
        const dx = other.x - v.x;
        const dy = other.y - v.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < closestDist) {
          closestDist = dist;
          closest = other;
        }
      }

      if (!closest) {
        v.input.throttle = 0.3;
        v.input.steer = Math.sin(this.tickCount * 0.05) * 0.5;
        return;
      }

      v.aiTarget = closest.id;

      // State machine
      if (closestDist < KICK_RANGE && v.balance > KICK_COST) {
        v.aiState = 'attack';
      } else if (v.balance < 20 || v.health < 20) {
        v.aiState = 'evade';
      } else {
        v.aiState = 'pursue';
      }
    }

    const target = v.aiTarget ? this.vehicles.get(v.aiTarget) : null;

    switch (v.aiState) {
      case 'pursue': {
        if (!target || target.eliminated) break;
        const dx = target.x - v.x;
        const dy = target.y - v.y;
        const targetAngle = Math.atan2(dy, dx);
        let angleDiff = targetAngle - v.angle;
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        v.input.steer = Math.max(-1, Math.min(1, angleDiff * 2));
        v.input.throttle = 0.8;
        v.input.brake = 0;
        break;
      }
      case 'attack': {
        if (!target || target.eliminated) { v.aiState = 'pursue'; break; }
        const dx = target.x - v.x;
        const dy = target.y - v.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const targetAngle = Math.atan2(dy, dx);
        let angleDiff = targetAngle - v.angle;
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        v.input.steer = Math.max(-1, Math.min(1, angleDiff * 3));
        v.input.throttle = 0.4;

        if (dist < KICK_RANGE && Math.abs(angleDiff) < Math.PI * 0.5) {
          const attacks = ['kick', 'weapon', 'brake_pinch'];
          v.input.attack = attacks[Math.floor(Math.random() * attacks.length)];
        }
        break;
      }
      case 'evade': {
        if (!target || target.eliminated) break;
        const dx = target.x - v.x;
        const dy = target.y - v.y;
        // Run away
        const awayAngle = Math.atan2(-dy, -dx);
        let angleDiff = awayAngle - v.angle;
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        v.input.steer = Math.max(-1, Math.min(1, angleDiff * 2));
        v.input.throttle = 1.0;
        v.input.brake = 0;
        break;
      }
    }
  }

  getSnapshot() {
    const vehicles = [];
    for (const v of this.vehicles.values()) {
      vehicles.push({
        id: v.id,
        name: v.name,
        x: Math.round(v.x * 10) / 10,
        y: Math.round(v.y * 10) / 10,
        angle: Math.round(v.angle * 1000) / 1000,
        speed: Math.round(v.speed * 10) / 10,
        balance: Math.round(v.balance),
        health: Math.round(v.health),
        score: v.score,
        stunTimer: v.stunTimer,
        immuneTimer: v.immuneTimer,
        eliminated: v.eliminated,
        aiState: v.isAI ? v.aiState : undefined,
      });
    }

    return {
      type: MsgType.STATE_SNAPSHOT,
      tick: this.tickCount,
      timestamp: Date.now(),
      vehicles,
      arena: { width: ARENA_WIDTH, height: ARENA_HEIGHT },
    };
  }

  getAliveCount() {
    let count = 0;
    for (const v of this.vehicles.values()) {
      if (!v.eliminated) count++;
    }
    return count;
  }
}

module.exports = { GameEngine, ARENA_WIDTH, ARENA_HEIGHT };
