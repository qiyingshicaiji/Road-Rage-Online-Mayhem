/**
 * OfflineEngine - Client-side game engine for single-player / offline mode
 * Mirrors the server GameEngine logic so the game can be played without a server.
 */
class OfflineEngine {
  constructor() {
    this.vehicles = new Map();
    this.tickCount = 0;
    this.running = false;
    this.interval = null;
    this.lastTime = Date.now();
    this.arena = { width: 1600, height: 1200 };
    this.attackEvents = [];

    // Constants
    this.MAX_SPEED = 300;
    this.ACCELERATION = 200;
    this.BRAKE_FORCE = 400;
    this.FRICTION = 50;
    this.TURN_SPEED = 3.0;
    this.BALANCE_MAX = 100;
    this.BALANCE_RECOVERY = 5;
    this.KICK_RANGE = 80;
    this.KICK_COST = 15;
    this.KICK_DAMAGE = 20;
    this.BRAKE_PINCH_RANGE = 70;
    this.BRAKE_PINCH_COST = 10;
    this.WEAPON_RANGE = 90;
    this.WEAPON_COST = 20;
    this.WEAPON_DAMAGE = 25;
  }

  addVehicle(id, name, isAI = false) {
    const angle = Math.random() * Math.PI * 2;
    const spawnRadius = 350;
    const cx = this.arena.width / 2;
    const cy = this.arena.height / 2;
    this.vehicles.set(id, {
      id,
      name,
      x: cx + Math.cos(angle) * spawnRadius,
      y: cy + Math.sin(angle) * spawnRadius,
      angle: angle + Math.PI,
      speed: 0,
      balance: this.BALANCE_MAX,
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

  applyInput(id, input) {
    const v = this.vehicles.get(id);
    if (v) {
      v.input = { ...v.input, ...input };
    }
  }

  start(onSnapshot) {
    if (this.running) return;
    this.running = true;
    this.lastTime = Date.now();
    this.onSnapshot = onSnapshot;
    this.interval = setInterval(() => {
      const snapshot = this.tick();
      if (this.onSnapshot) this.onSnapshot(snapshot);
    }, 50);
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
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    this.tickCount++;
    this.attackEvents = [];

    for (const v of this.vehicles.values()) {
      if (v.eliminated) continue;

      // Immunity timer countdown
      if (v.immuneTimer > 0) {
        v.immuneTimer -= dt;
      }

      if (v.isAI) this.updateAI(v, dt);

      if (v.stunTimer > 0) {
        v.stunTimer -= dt;
        v.speed *= 0.95;
        continue;
      }

      // Steering
      if (v.speed !== 0) {
        const turnFactor = Math.min(1, Math.abs(v.speed) / 100);
        v.angle += v.input.steer * this.TURN_SPEED * turnFactor * dt;
      }

      // Acceleration
      if (v.input.throttle > 0) v.speed += this.ACCELERATION * v.input.throttle * dt;
      if (v.input.brake > 0) v.speed -= this.BRAKE_FORCE * v.input.brake * dt;

      // Friction
      if (v.speed > 0) v.speed = Math.max(0, v.speed - this.FRICTION * dt);
      else if (v.speed < 0) v.speed = Math.min(0, v.speed + this.FRICTION * dt);

      v.speed = Math.max(-this.MAX_SPEED * 0.3, Math.min(this.MAX_SPEED, v.speed));

      // Position
      v.x += Math.cos(v.angle) * v.speed * dt;
      v.y += Math.sin(v.angle) * v.speed * dt;

      // Boundaries
      if (v.x < 30) { v.x = 30; v.speed *= -0.3; v.balance -= 5; }
      if (v.x > this.arena.width - 30) { v.x = this.arena.width - 30; v.speed *= -0.3; v.balance -= 5; }
      if (v.y < 30) { v.y = 30; v.speed *= -0.3; v.balance -= 5; }
      if (v.y > this.arena.height - 30) { v.y = this.arena.height - 30; v.speed *= -0.3; v.balance -= 5; }

      // Balance recovery
      if (!v.input.attack && v.stunTimer <= 0) {
        v.balance = Math.min(this.BALANCE_MAX, v.balance + this.BALANCE_RECOVERY * dt);
      }

      // Attacks
      if (v.input.attack && v.balance > 0) {
        this.processAttack(v, v.input.attack);
        v.input.attack = null;
      }

      if (v.health <= 0) {
        v.eliminated = true;
        v.speed = 0;
      }
    }

    this.checkCollisions();
    return this.getSnapshot();
  }

  processAttack(attacker, type) {
    let range, cost, damage;
    switch (type) {
      case 'kick':
        range = this.KICK_RANGE; cost = this.KICK_COST; damage = this.KICK_DAMAGE; break;
      case 'brake_pinch':
        range = this.BRAKE_PINCH_RANGE; cost = this.BRAKE_PINCH_COST; damage = 10; break;
      case 'weapon':
        range = this.WEAPON_RANGE; cost = this.WEAPON_COST; damage = this.WEAPON_DAMAGE; break;
      default: return;
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
        const angleToTarget = Math.atan2(dy, dx);
        let angleDiff = angleToTarget - attacker.angle;
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

        if (Math.abs(angleDiff) < Math.PI * 0.6) {
          target.health -= damage;
          target.balance -= damage * 0.5;

          if (type === 'kick') {
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
          this.attackEvents.push({
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
          const overlap = minDist - dist;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x -= nx * overlap * 0.5;
          a.y -= ny * overlap * 0.5;
          b.x += nx * overlap * 0.5;
          b.y += ny * overlap * 0.5;
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
      let closest = null;
      let closestDist = Infinity;
      for (const other of this.vehicles.values()) {
        if (other.id === v.id || other.eliminated) continue;
        const dx = other.x - v.x;
        const dy = other.y - v.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < closestDist) { closestDist = dist; closest = other; }
      }
      if (!closest) {
        v.input.throttle = 0.3;
        v.input.steer = Math.sin(this.tickCount * 0.05) * 0.5;
        return;
      }
      v.aiTarget = closest.id;
      if (closestDist < this.KICK_RANGE && v.balance > this.KICK_COST) v.aiState = 'attack';
      else if (v.balance < 20 || v.health < 20) v.aiState = 'evade';
      else v.aiState = 'pursue';
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
        if (dist < this.KICK_RANGE && Math.abs(angleDiff) < Math.PI * 0.5) {
          const attacks = ['kick', 'weapon', 'brake_pinch'];
          v.input.attack = attacks[Math.floor(Math.random() * attacks.length)];
        }
        break;
      }
      case 'evade': {
        if (!target || target.eliminated) break;
        const dx = target.x - v.x;
        const dy = target.y - v.y;
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
      arena: { ...this.arena },
    };
  }

  getAliveCount() {
    let count = 0;
    for (const v of this.vehicles.values()) {
      if (!v.eliminated) count++;
    }
    return count;
  }

  getAttackEvents() {
    return this.attackEvents;
  }
}
