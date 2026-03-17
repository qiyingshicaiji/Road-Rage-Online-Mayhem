#include "game/ai_controller.h"
#include "game/combat.h"
#include <cmath>
#include <cstdlib>
#include <algorithm>

namespace roadrage {

AIController::AIController(uint32_t vehicle_id)
    : vehicle_id_(vehicle_id)
{
}

void AIController::transition_to(AIState new_state) {
    state_ = new_state;
    state_timer_ = 0.0f;
}

InputFrame AIController::update(float dt, const Vehicle& self, const Vehicle* nearest_enemy) {
    state_timer_ += dt;
    if (attack_cooldown_ > 0.0f) {
        attack_cooldown_ -= dt;
    }

    // State transitions
    if (!nearest_enemy) {
        if (state_ != AIState::IDLE) {
            transition_to(AIState::IDLE);
        }
        return do_idle(dt, self);
    }

    float dist = point_distance(self.x(), self.y(), nearest_enemy->x(), nearest_enemy->y());

    switch (state_) {
        case AIState::IDLE:
            if (dist < 20.0f) {
                transition_to(AIState::CHASE);
            }
            return do_idle(dt, self);

        case AIState::CHASE:
            if (dist < 2.5f && attack_cooldown_ <= 0.0f) {
                transition_to(AIState::ATTACK);
            } else if (self.balance() < 20.0f) {
                transition_to(AIState::EVADE);
            } else if (dist > 30.0f) {
                transition_to(AIState::IDLE);
            }
            return do_chase(dt, self, *nearest_enemy);

        case AIState::ATTACK:
            if (dist > 3.0f || state_timer_ > 0.5f) {
                transition_to(AIState::CHASE);
            }
            return do_attack(dt, self, *nearest_enemy);

        case AIState::EVADE:
            if (self.balance() > 60.0f) {
                transition_to(AIState::CHASE);
            } else if (state_timer_ > 3.0f) {
                transition_to(AIState::IDLE);
            }
            return do_evade(dt, self, *nearest_enemy);
    }

    return do_idle(dt, self);
}

InputFrame AIController::do_idle(float dt, const Vehicle& self) {
    InputFrame input;
    input.throttle = 180;  // Cruise speed
    input.steering = 0;
    input.brake = false;
    input.attack = AttackType::NONE;
    input.target_id = 0;

    // Stay on track (center line at y=0)
    float y_error = -self.y();
    float angle_error = normalize_angle(-self.angle());
    int8_t steer = static_cast<int8_t>(std::clamp(
        (y_error * 0.5f + angle_error * 30.0f), -127.0f, 127.0f));
    input.steering = steer;

    return input;
}

InputFrame AIController::do_chase(float dt, const Vehicle& self, const Vehicle& target) {
    InputFrame input;
    input.attack = AttackType::NONE;
    input.target_id = 0;

    float angle_to_target = point_angle(self.x(), self.y(), target.x(), target.y());
    float angle_diff = normalize_angle(angle_to_target - self.angle());

    // Steer towards target
    input.steering = static_cast<int8_t>(std::clamp(angle_diff * 60.0f, -127.0f, 127.0f));

    // Speed control - accelerate if behind, match speed if close
    float dist = point_distance(self.x(), self.y(), target.x(), target.y());
    if (dist > 5.0f) {
        input.throttle = 255;  // Full throttle
    } else {
        input.throttle = 200;  // Match speed
    }
    input.brake = false;

    return input;
}

InputFrame AIController::do_attack(float dt, const Vehicle& self, const Vehicle& target) {
    InputFrame input;

    // Choose attack based on position
    float dist = point_distance(self.x(), self.y(), target.x(), target.y());
    float angle_to_target = point_angle(self.x(), self.y(), target.x(), target.y());
    float relative_angle = normalize_angle(angle_to_target - self.angle());

    if (attack_cooldown_ <= 0.0f) {
        // Pick best attack based on position
        if (dist < 1.5f && std::abs(relative_angle) < 0.5f) {
            input.attack = AttackType::KICK;
            attack_cooldown_ = CombatSystem::get_cooldown(AttackType::KICK);
        } else if (dist < 2.0f) {
            input.attack = AttackType::SMASH;
            attack_cooldown_ = CombatSystem::get_cooldown(AttackType::SMASH);
        } else {
            input.attack = AttackType::NONE;
        }
        input.target_id = target.id();
    } else {
        input.attack = AttackType::NONE;
        input.target_id = 0;
    }

    // Keep close to target
    input.steering = static_cast<int8_t>(std::clamp(
        normalize_angle(angle_to_target - self.angle()) * 40.0f, -127.0f, 127.0f));
    input.throttle = 180;
    input.brake = false;

    return input;
}

InputFrame AIController::do_evade(float dt, const Vehicle& self, const Vehicle& target) {
    InputFrame input;
    input.attack = AttackType::NONE;
    input.target_id = 0;

    // Move away from target
    float angle_to_target = point_angle(self.x(), self.y(), target.x(), target.y());
    float away_angle = normalize_angle(angle_to_target + static_cast<float>(M_PI));
    float angle_diff = normalize_angle(away_angle - self.angle());

    input.steering = static_cast<int8_t>(std::clamp(angle_diff * 40.0f, -127.0f, 127.0f));
    input.throttle = 255;  // Full speed escape
    input.brake = false;

    return input;
}

} // namespace roadrage
