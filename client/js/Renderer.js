/**
 * Renderer - Handles all Canvas rendering for the game
 */
class Renderer {
  constructor(canvas, minimapCanvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.minimap = minimapCanvas;
    this.minimapCtx = minimapCanvas.getContext('2d');

    this.camera = { x: 0, y: 0, scale: 1 };
    this.effects = [];
    this.trailPoints = new Map(); // vehicleId -> trail points

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  updateCamera(targetX, targetY, arenaWidth, arenaHeight) {
    // Smooth camera follow
    const targetCamX = targetX - this.canvas.width / 2;
    const targetCamY = targetY - this.canvas.height / 2;
    this.camera.x += (targetCamX - this.camera.x) * 0.1;
    this.camera.y += (targetCamY - this.camera.y) * 0.1;

    // Clamp camera
    this.camera.x = Math.max(0, Math.min(arenaWidth - this.canvas.width, this.camera.x));
    this.camera.y = Math.max(0, Math.min(arenaHeight - this.canvas.height, this.camera.y));
  }

  render(snapshot, playerId, effects) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Clear
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, w, h);

    if (!snapshot) return;

    const arena = snapshot.arena;

    // Find player vehicle for camera
    const playerVehicle = snapshot.vehicles.find(v => v.id === playerId);
    if (playerVehicle) {
      this.updateCamera(playerVehicle.x, playerVehicle.y, arena.width, arena.height);
    }

    ctx.save();
    ctx.translate(-this.camera.x, -this.camera.y);

    // Draw arena
    this.drawArena(ctx, arena);

    // Draw trail effects
    this.drawTrails(ctx, snapshot.vehicles);

    // Draw vehicles
    for (const v of snapshot.vehicles) {
      this.drawVehicle(ctx, v, v.id === playerId);
    }

    // Draw effects
    this.drawEffects(ctx, effects);

    ctx.restore();

    // Draw minimap
    this.drawMinimap(snapshot, playerId);
  }

  drawArena(ctx, arena) {
    // Background
    ctx.fillStyle = '#16213e';
    ctx.fillRect(0, 0, arena.width, arena.height);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    const gridSize = 80;
    for (let x = 0; x <= arena.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, arena.height);
      ctx.stroke();
    }
    for (let y = 0; y <= arena.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(arena.width, y);
      ctx.stroke();
    }

    // Arena border
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, arena.width - 4, arena.height - 4);

    // Road markings - central circle
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 2;
    ctx.setLineDash([20, 10]);
    ctx.beginPath();
    ctx.arc(arena.width / 2, arena.height / 2, 200, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(arena.width / 2, arena.height / 2, 400, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Center marker
    ctx.fillStyle = 'rgba(255, 68, 68, 0.15)';
    ctx.beginPath();
    ctx.arc(arena.width / 2, arena.height / 2, 30, 0, Math.PI * 2);
    ctx.fill();
  }

  drawVehicle(ctx, vehicle, isPlayer) {
    const { x, y, angle, speed, balance, health, name, eliminated, isAI, stunTimer, immuneTimer } = vehicle;

    if (eliminated) {
      // Draw wreckage
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = '#444';
      ctx.fillRect(-20, -10, 40, 20);
      ctx.globalAlpha = 1;
      // Smoke effect
      ctx.fillStyle = 'rgba(100,100,100,0.3)';
      const smokeOffset = Math.sin(Date.now() * 0.005) * 5;
      ctx.beginPath();
      ctx.arc(0, smokeOffset - 15, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.translate(x, y);

    // Stun indicator
    if (stunTimer > 0) {
      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth = 2;
      const radius = 30 + Math.sin(Date.now() * 0.02) * 5;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Immunity shield
    if (immuneTimer > 0) {
      const pulse = 0.3 + Math.sin(Date.now() * 0.008) * 0.15;
      ctx.strokeStyle = `rgba(100, 200, 255, ${pulse})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, 35, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = `rgba(100, 200, 255, ${pulse * 0.15})`;
      ctx.beginPath();
      ctx.arc(0, 0, 35, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.rotate(angle);

    // Engine glow based on speed
    const speedPercent = Math.abs(speed) / 300;
    if (speedPercent > 0.1) {
      const glowSize = 15 + speedPercent * 20;
      const gradient = ctx.createRadialGradient(-15, 0, 0, -15, 0, glowSize);
      gradient.addColorStop(0, `rgba(255, ${100 + 155 * (1 - speedPercent)}, 0, ${speedPercent * 0.5})`);
      gradient.addColorStop(1, 'rgba(255, 100, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(-15, 0, glowSize, 0, Math.PI * 2);
      ctx.fill();
    }

    // Motorcycle body
    const mainColor = isPlayer ? '#ff4444' : (isAI ? '#4488ff' : '#44ff44');
    const darkColor = isPlayer ? '#aa2222' : (isAI ? '#2255aa' : '#22aa22');

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(2, 3, 22, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = darkColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, 22, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = mainColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Front (direction indicator)
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(14, -5);
    ctx.lineTo(14, 5);
    ctx.closePath();
    ctx.fill();

    // Driver circle
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    ctx.arc(4, 0, 5, 0, Math.PI * 2);
    ctx.fill();

    // Passenger circle
    ctx.fillStyle = '#ff6600';
    ctx.beginPath();
    ctx.arc(-8, 0, 4, 0, Math.PI * 2);
    ctx.fill();

    // Wheels
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(14, -9, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(14, 9, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-14, -8, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-14, 8, 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Name & health bar (drawn in screen space relative to vehicle)
    ctx.save();
    ctx.translate(x, y);

    // Name tag
    ctx.font = 'bold 11px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = isPlayer ? '#ffaa00' : '#aaa';
    ctx.fillText(name || 'Unknown', 0, -28);

    // Health bar background
    const barWidth = 40;
    const barHeight = 4;
    const barY = -22;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(-barWidth / 2, barY, barWidth, barHeight);

    // Health bar fill
    const healthPercent = Math.max(0, health / 100);
    const healthColor = healthPercent > 0.5 ? '#00ff44' : healthPercent > 0.25 ? '#ffaa00' : '#ff4444';
    ctx.fillStyle = healthColor;
    ctx.fillRect(-barWidth / 2, barY, barWidth * healthPercent, barHeight);

    // Balance indicator (small bar)
    const balBarY = barY + barHeight + 2;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(-barWidth / 2, balBarY, barWidth, 2);
    ctx.fillStyle = '#ffaa00';
    ctx.fillRect(-barWidth / 2, balBarY, barWidth * (Math.max(0, balance) / 100), 2);

    // AI state indicator
    if (isAI && vehicle.aiState) {
      ctx.font = '9px sans-serif';
      ctx.fillStyle = '#666';
      const stateLabels = { pursue: '追击', attack: '攻击', evade: '闪避' };
      ctx.fillText(stateLabels[vehicle.aiState] || '', 0, 22);
    }

    ctx.restore();
  }

  drawTrails(ctx, vehicles) {
    for (const v of vehicles) {
      if (v.eliminated) continue;
      if (!this.trailPoints.has(v.id)) {
        this.trailPoints.set(v.id, []);
      }
      const trail = this.trailPoints.get(v.id);

      if (Math.abs(v.speed) > 50) {
        trail.push({ x: v.x, y: v.y, time: Date.now() });
      }

      // Remove old points
      const now = Date.now();
      while (trail.length > 0 && now - trail[0].time > 500) {
        trail.shift();
      }

      // Draw trail
      if (trail.length > 1) {
        ctx.beginPath();
        ctx.moveTo(trail[0].x, trail[0].y);
        for (let i = 1; i < trail.length; i++) {
          ctx.lineTo(trail[i].x, trail[i].y);
        }
        ctx.strokeStyle = v.id.startsWith('ai') ? 'rgba(68,136,255,0.15)' : 'rgba(255,68,68,0.2)';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }
  }

  drawEffects(ctx, effects) {
    const now = Date.now();
    for (let i = effects.length - 1; i >= 0; i--) {
      const eff = effects[i];
      const elapsed = now - eff.startTime;
      const progress = elapsed / eff.duration;

      if (progress >= 1) {
        effects.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.translate(eff.x, eff.y);
      ctx.globalAlpha = 1 - progress;

      switch (eff.type) {
        case 'kick': {
          const radius = 20 + progress * 40;
          ctx.strokeStyle = '#ffaa00';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, 0, radius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.font = 'bold 16px sans-serif';
          ctx.fillStyle = '#ffaa00';
          ctx.textAlign = 'center';
          ctx.fillText('踢!', 0, -radius - 5);
          break;
        }
        case 'brake_pinch': {
          ctx.fillStyle = '#ff4444';
          for (let j = 0; j < 6; j++) {
            const angle = (j / 6) * Math.PI * 2 + progress * Math.PI;
            const dist = 15 + progress * 30;
            ctx.fillRect(
              Math.cos(angle) * dist - 3,
              Math.sin(angle) * dist - 3,
              6, 6
            );
          }
          ctx.font = 'bold 14px sans-serif';
          ctx.fillStyle = '#ff4444';
          ctx.textAlign = 'center';
          ctx.fillText('减速!', 0, -30 - progress * 20);
          break;
        }
        case 'weapon': {
          const radius = 25 + progress * 50;
          ctx.strokeStyle = '#ff4444';
          ctx.lineWidth = 2;
          // Star burst
          for (let j = 0; j < 8; j++) {
            const angle = (j / 8) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
            ctx.stroke();
          }
          ctx.font = 'bold 18px sans-serif';
          ctx.fillStyle = '#ff4444';
          ctx.textAlign = 'center';
          ctx.fillText('重击!', 0, -radius - 5);
          break;
        }
        case 'collision': {
          const radius = 10 + progress * 25;
          ctx.fillStyle = `rgba(255, 200, 0, ${0.5 * (1 - progress)})`;
          ctx.beginPath();
          ctx.arc(0, 0, radius, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'damage': {
          ctx.font = `bold ${14 + progress * 8}px sans-serif`;
          ctx.fillStyle = '#ff4444';
          ctx.textAlign = 'center';
          ctx.fillText(`-${eff.damage}`, 0, -20 - progress * 30);
          break;
        }
      }

      ctx.restore();
    }
  }

  drawMinimap(snapshot, playerId) {
    const ctx = this.minimapCtx;
    const mw = this.minimap.width;
    const mh = this.minimap.height;
    const arena = snapshot.arena;

    ctx.fillStyle = 'rgba(10, 15, 30, 0.9)';
    ctx.fillRect(0, 0, mw, mh);

    // Border
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, mw, mh);

    const scaleX = mw / arena.width;
    const scaleY = mh / arena.height;

    // Draw vehicles on minimap
    for (const v of snapshot.vehicles) {
      const mx = v.x * scaleX;
      const my = v.y * scaleY;

      if (v.eliminated) {
        ctx.fillStyle = '#444';
      } else if (v.id === playerId) {
        ctx.fillStyle = '#ff4444';
      } else if (v.isAI) {
        ctx.fillStyle = '#4488ff';
      } else {
        ctx.fillStyle = '#44ff44';
      }

      ctx.beginPath();
      ctx.arc(mx, my, v.id === playerId ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Camera viewport
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      this.camera.x * scaleX,
      this.camera.y * scaleY,
      this.canvas.width * scaleX,
      this.canvas.height * scaleY
    );
  }

  addEffect(type, x, y, data) {
    return {
      type,
      x,
      y,
      startTime: Date.now(),
      duration: data?.duration || 600,
      ...data,
    };
  }
}
