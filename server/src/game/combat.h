#pragma once

#include "game/vehicle.h"
#include "network/protocol.h"

namespace roadrage {

// Attack result
struct AttackResult {
    bool hit;
    AttackType type;
    uint32_t attacker_vehicle_id;
    uint32_t target_vehicle_id;
    float damage_balance;     // Balance consumed by target
    float self_balance_cost;  // Balance consumed by attacker's vehicle
    float disturbance_torque; // Torque applied to target
    float speed_loss;         // Speed loss for target
};

// Combat system - handles attack detection and resolution
class CombatSystem {
public:
    // Check if an attack hits and calculate results
    // Attacker and target are the vehicles
    static AttackResult resolve_attack(
        AttackType type,
        const Vehicle& attacker,
        const Vehicle& target
    );

    // Get attack range for a given type
    static float get_attack_range(AttackType type);

    // Get attack angle (cone half-angle in radians)
    static float get_attack_angle(AttackType type);

    // Get balance cost for attacker's vehicle
    static float get_self_balance_cost(AttackType type);

    // Get cooldown time in seconds
    static float get_cooldown(AttackType type);

private:
    // Check if target is within attack range and angle
    static bool check_hit(
        AttackType type,
        const Vehicle& attacker,
        const Vehicle& target
    );
};

} // namespace roadrage
