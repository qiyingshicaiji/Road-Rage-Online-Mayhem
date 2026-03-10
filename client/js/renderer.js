/**
 * Renderer - Canvas rendering for the top-down racing game
 */

class GameRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.camera = { x: 0, y: 0, zoom: 4.0 };
        this.attackEffects = [];

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    // Set camera to follow a vehicle
    followVehicle(vehicle) {
        if (!vehicle) return;
        const targetX = vehicle.pos_x;
        const targetY = vehicle.pos_y;
        // Smooth camera follow
        this.camera.x += (targetX - this.camera.x) * 0.1;
        this.camera.y += (targetY - this.camera.y) * 0.1;
    }

    // World to screen coordinate conversion
    worldToScreen(wx, wy) {
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;
        return {
            x: cx + (wx - this.camera.x) * this.camera.zoom,
            y: cy + (wy - this.camera.y) * this.camera.zoom,
        };
    }

    // Add a visual attack effect
    addAttackEffect(attackerX, attackerY, targetX, targetY, type) {
        this.attackEffects.push({
            x1: attackerX, y1: attackerY,
            x2: targetX, y2: targetY,
            type: type,
            timer: 0.5,  // Duration in seconds
        });
    }

    // Main render function
    render(gameState) {
        const ctx = this.ctx;
        const W = this.canvas.width;
        const H = this.canvas.height;

        // Clear
        ctx.fillStyle = '#2d5a27';
        ctx.fillRect(0, 0, W, H);

        // Draw track
        this.drawTrack(gameState.track);

        // Draw vehicles
        if (gameState.vehicles) {
            for (const v of gameState.vehicles) {
                this.drawVehicle(v, gameState.myVehicleId);
            }
        }

        // Draw attack effects
        this.drawAttackEffects(gameState.dt);

        // Draw minimap
        this.drawMinimap(gameState);
    }

    drawTrack(track) {
        const ctx = this.ctx;
        const trackLength = track.length || 2000;
        const trackWidth = track.width || 12;

        // Draw road surface
        const startWorld = this.worldToScreen(0, -trackWidth / 2);
        const endWorld = this.worldToScreen(trackLength, trackWidth / 2);

        ctx.fillStyle = '#555';
        ctx.fillRect(startWorld.x, startWorld.y,
            endWorld.x - startWorld.x,
            endWorld.y - startWorld.y);

        // Lane markings
        const lanes = 4;
        ctx.strokeStyle = '#fff';
        ctx.setLineDash([20 * this.camera.zoom, 15 * this.camera.zoom]);
        ctx.lineWidth = 1;

        for (let i = 1; i < lanes; i++) {
            const laneY = -trackWidth / 2 + (trackWidth / lanes) * i;
            const start = this.worldToScreen(0, laneY);
            const end = this.worldToScreen(trackLength, laneY);
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();
        }
        ctx.setLineDash([]);

        // Road borders
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        const topLeft = this.worldToScreen(0, -trackWidth / 2);
        const topRight = this.worldToScreen(trackLength, -trackWidth / 2);
        const botLeft = this.worldToScreen(0, trackWidth / 2);
        const botRight = this.worldToScreen(trackLength, trackWidth / 2);

        ctx.beginPath();
        ctx.moveTo(topLeft.x, topLeft.y);
        ctx.lineTo(topRight.x, topRight.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(botLeft.x, botLeft.y);
        ctx.lineTo(botRight.x, botRight.y);
        ctx.stroke();

        // Start line
        const startLine1 = this.worldToScreen(50, -trackWidth / 2);
        const startLine2 = this.worldToScreen(50, trackWidth / 2);
        ctx.strokeStyle = '#f7c948';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.moveTo(startLine1.x, startLine1.y);
        ctx.lineTo(startLine2.x, startLine2.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Finish line indicators (every track.length meters)
        for (let lap = 1; lap <= 3; lap++) {
            const finishX = trackLength * lap;
            const fl1 = this.worldToScreen(finishX, -trackWidth / 2);
            const fl2 = this.worldToScreen(finishX, trackWidth / 2);
            ctx.strokeStyle = lap === 3 ? '#ff5252' : '#888';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(fl1.x, fl1.y);
            ctx.lineTo(fl2.x, fl2.y);
            ctx.stroke();
        }

        // Grass texture (simple dots)
        ctx.fillStyle = '#1e4d1e';
        const grassExtent = 30;
        for (let x = -50; x < trackLength + 50; x += 10) {
            for (let side = -1; side <= 1; side += 2) {
                const gy = side * (trackWidth / 2 + 5 + Math.random() * grassExtent);
                const gScreen = this.worldToScreen(x, gy);
                if (gScreen.x > -50 && gScreen.x < this.canvas.width + 50 &&
                    gScreen.y > -50 && gScreen.y < this.canvas.height + 50) {
                    ctx.beginPath();
                    ctx.arc(gScreen.x, gScreen.y, 2, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
    }

    drawVehicle(v, myVehicleId) {
        const ctx = this.ctx;
        const pos = this.worldToScreen(v.pos_x, v.pos_y);

        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(v.angle);

        const scale = this.camera.zoom;
        const vw = 2.0 * scale;  // Vehicle width (length in travel direction)
        const vh = 0.8 * scale;  // Vehicle height

        const isPlayer = v.vehicle_id === myVehicleId;

        // Vehicle body
        ctx.fillStyle = isPlayer ? '#ff6b35' : '#4a9eff';
        ctx.strokeStyle = isPlayer ? '#ff8f5e' : '#7cb8ff';
        ctx.lineWidth = 2;

        // Motorcycle shape
        ctx.beginPath();
        ctx.ellipse(0, 0, vw, vh, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Front indicator
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(vw * 0.7, 0, vh * 0.4, 0, Math.PI * 2);
        ctx.fill();

        // Driver dot
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.arc(vw * 0.2, 0, vh * 0.5, 0, Math.PI * 2);
        ctx.fill();

        // Passenger dot (if present)
        if (v.passenger_id > 0) {
            ctx.fillStyle = '#c00';
            ctx.beginPath();
            ctx.arc(-vw * 0.3, 0, vh * 0.4, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();

        // Balance bar above vehicle
        if (v.balance < 100) {
            const barWidth = 30;
            const barHeight = 4;
            const barX = pos.x - barWidth / 2;
            const barY = pos.y - vh * 2 - 8;

            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);

            const ratio = v.balance / 100;
            const barColor = ratio > 0.5 ? '#00c853' : ratio > 0.2 ? '#ffc107' : '#ff5252';
            ctx.fillStyle = barColor;
            ctx.fillRect(barX, barY, barWidth * ratio, barHeight);
        }

        // Vehicle label
        ctx.fillStyle = isPlayer ? '#ff6b35' : '#4a9eff';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        const label = isPlayer ? '● YOU' :
            (v.driver_id >= 10000 ? 'AI' : `P${v.vehicle_id}`);
        ctx.fillText(label, pos.x, pos.y - vh * 2 - 14);

        // Out of control indicator
        if (v.balance <= 0) {
            ctx.fillStyle = '#ff5252';
            ctx.font = 'bold 14px sans-serif';
            ctx.fillText('⚠ UNSTABLE!', pos.x, pos.y + vh * 2 + 16);
        }
    }

    drawAttackEffects(dt) {
        const ctx = this.ctx;

        this.attackEffects = this.attackEffects.filter(e => {
            e.timer -= dt;
            if (e.timer <= 0) return false;

            const alpha = e.timer / 0.5;
            const p1 = this.worldToScreen(e.x1, e.y1);
            const p2 = this.worldToScreen(e.x2, e.y2);

            // Draw effect based on type
            ctx.globalAlpha = alpha;
            if (e.type === AttackType.KICK) {
                ctx.strokeStyle = '#ff5252';
                ctx.lineWidth = 3;
            } else if (e.type === AttackType.BRAKE_GRAB) {
                ctx.strokeStyle = '#ffc107';
                ctx.lineWidth = 2;
            } else if (e.type === AttackType.SMASH) {
                ctx.strokeStyle = '#ff00ff';
                ctx.lineWidth = 4;
            }

            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();

            // Impact circle
            const radius = (1 - e.timer / 0.5) * 20;
            ctx.beginPath();
            ctx.arc(p2.x, p2.y, radius, 0, Math.PI * 2);
            ctx.stroke();

            ctx.globalAlpha = 1;
            return true;
        });
    }

    drawMinimap(gameState) {
        const ctx = this.ctx;
        const mmW = 200;
        const mmH = 30;
        const mmX = this.canvas.width - mmW - 20;
        const mmY = this.canvas.height - mmH - 50;
        const trackLen = (gameState.track.length || 2000) * (gameState.track.num_laps || 3);

        // Background
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1;
        ctx.fillRect(mmX, mmY, mmW, mmH);
        ctx.strokeRect(mmX, mmY, mmW, mmH);

        // Track line
        ctx.strokeStyle = '#777';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(mmX + 5, mmY + mmH / 2);
        ctx.lineTo(mmX + mmW - 5, mmY + mmH / 2);
        ctx.stroke();

        // Vehicle dots
        if (gameState.vehicles) {
            for (const v of gameState.vehicles) {
                const progress = Math.min(1, v.distance / trackLen);
                const dotX = mmX + 5 + progress * (mmW - 10);
                const dotY = mmY + mmH / 2;

                ctx.fillStyle = v.vehicle_id === gameState.myVehicleId ? '#ff6b35' : '#4a9eff';
                ctx.beginPath();
                ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Label
        ctx.fillStyle = '#aaa';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('Minimap', mmX, mmY - 4);
    }
}
