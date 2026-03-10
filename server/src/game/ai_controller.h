#pragma once

#include "game/vehicle.h"
#include "network/protocol.h"
#include <cstdint>

namespace roadrage {

// AI behavior states
enum class AIState {
    IDLE,
    CHASE,
    ATTACK,
    EVADE,
};

// AI controller for a single vehicle
class AIController {
public:
    AIController(uint32_t vehicle_id);

    // Update AI decision making and produce an InputFrame
    InputFrame update(float dt, const Vehicle& self, const Vehicle* nearest_enemy);

    AIState state() const { return state_; }

private:
    void transition_to(AIState new_state);
    InputFrame do_idle(float dt, const Vehicle& self);
    InputFrame do_chase(float dt, const Vehicle& self, const Vehicle& target);
    InputFrame do_attack(float dt, const Vehicle& self, const Vehicle& target);
    InputFrame do_evade(float dt, const Vehicle& self, const Vehicle& target);

    uint32_t vehicle_id_;
    AIState state_ = AIState::IDLE;
    float state_timer_ = 0.0f;
    float attack_cooldown_ = 0.0f;

    // Track center line for navigation
    float target_y_ = 0.0f;
};

} // namespace roadrage
