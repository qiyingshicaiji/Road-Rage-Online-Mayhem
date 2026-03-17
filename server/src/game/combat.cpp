#include "game/combat.h"
#include <cmath>

namespace roadrage {

float CombatSystem::get_attack_range(AttackType type) {
    switch (type) {
        case AttackType::KICK:       return 1.5f;  // 1.5m
        case AttackType::BRAKE_GRAB: return 1.0f;  // 1.0m
        case AttackType::SMASH:      return 2.0f;  // 2.0m
        default: return 0.0f;
    }
}

float CombatSystem::get_attack_angle(AttackType type) {
    switch (type) {
        case AttackType::KICK:       return 0.524f;  // ~30 degrees
        case AttackType::BRAKE_GRAB: return 0.785f;  // ~45 degrees (side-rear)
        case AttackType::SMASH:      return 0.524f;  // ~30 degrees (forward cone)
        default: return 0.0f;
    }
}

float CombatSystem::get_self_balance_cost(AttackType type) {
    switch (type) {
        case AttackType::KICK:       return 10.0f;
        case AttackType::BRAKE_GRAB: return 15.0f;
        case AttackType::SMASH:      return 20.0f;
        default: return 0.0f;
    }
}

float CombatSystem::get_cooldown(AttackType type) {
    switch (type) {
        case AttackType::KICK:       return 0.5f;
        case AttackType::BRAKE_GRAB: return 1.0f;
        case AttackType::SMASH:      return 1.5f;
        default: return 0.0f;
    }
}

bool CombatSystem::check_hit(AttackType type, const Vehicle& attacker, const Vehicle& target) {
    float dist = point_distance(attacker.x(), attacker.y(), target.x(), target.y());
    float range = get_attack_range(type);

    if (dist > range) return false;

    // Check angle
    float angle_to_target = point_angle(attacker.x(), attacker.y(), target.x(), target.y());
    float angle_diff = std::abs(normalize_angle(angle_to_target - attacker.angle()));
    float max_angle = get_attack_angle(type);

    // Special case: brake grab requires target to be in side-rear position
    if (type == AttackType::BRAKE_GRAB) {
        // Target should be roughly alongside or slightly behind
        float relative_angle = normalize_angle(angle_to_target - attacker.angle());
        return std::abs(relative_angle) > 1.0f && std::abs(relative_angle) < 2.6f;
    }

    return angle_diff <= max_angle;
}

AttackResult CombatSystem::resolve_attack(AttackType type, const Vehicle& attacker, const Vehicle& target) {
    AttackResult result;
    result.type = type;
    result.attacker_vehicle_id = attacker.id();
    result.target_vehicle_id = target.id();
    result.self_balance_cost = get_self_balance_cost(type);

    if (type == AttackType::NONE) {
        result.hit = false;
        result.damage_balance = 0.0f;
        result.disturbance_torque = 0.0f;
        result.speed_loss = 0.0f;
        result.self_balance_cost = 0.0f;
        return result;
    }

    result.hit = check_hit(type, attacker, target);

    if (!result.hit) {
        result.damage_balance = 0.0f;
        result.disturbance_torque = 0.0f;
        result.speed_loss = 0.0f;
        return result;
    }

    // Calculate effects based on attack type
    switch (type) {
        case AttackType::KICK:
            // Kick: causes temporary loss of control
            result.damage_balance = 15.0f;
            result.disturbance_torque = 0.3f;   // Moderate direction shift
            result.speed_loss = 2.0f;
            break;

        case AttackType::BRAKE_GRAB:
            // Brake grab: causes deceleration
            result.damage_balance = 10.0f;
            result.disturbance_torque = 0.1f;
            result.speed_loss = 8.0f;           // Heavy deceleration
            break;

        case AttackType::SMASH:
            // Weapon smash: causes stun and direction shift
            result.damage_balance = 25.0f;
            result.disturbance_torque = 0.5f;   // Strong direction shift
            result.speed_loss = 5.0f;
            break;

        default:
            result.damage_balance = 0.0f;
            result.disturbance_torque = 0.0f;
            result.speed_loss = 0.0f;
            break;
    }

    return result;
}

} // namespace roadrage
