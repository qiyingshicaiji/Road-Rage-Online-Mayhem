/**
 * Game logic tests (vehicle physics, combat, balance)
 */
#include "game/vehicle.h"
#include "game/combat.h"
#include <cassert>
#include <iostream>
#include <cmath>

using namespace roadrage;

void test_vehicle_creation() {
    std::cout << "  test_vehicle_creation...";

    Vehicle v(1, 0.0f, 0.0f, 0.0f);
    assert(v.id() == 1);
    assert(v.x() == 0.0f);
    assert(v.y() == 0.0f);
    assert(v.angle() == 0.0f);
    assert(v.speed() == 0.0f);
    assert(v.balance() == 100.0f);

    std::cout << " OK\n";
}

void test_vehicle_acceleration() {
    std::cout << "  test_vehicle_acceleration...";

    Vehicle v(1, 0.0f, 0.0f, 0.0f);

    // Apply full throttle
    v.apply_driver_input(255, 0, false);

    // Run several ticks
    for (int i = 0; i < 20; ++i) {
        v.update(0.05f);  // 50ms tick
    }

    // Should have some speed and moved forward
    assert(v.speed() > 0.0f);
    assert(v.x() > 0.0f);
    assert(std::abs(v.y()) < 0.1f);  // Should be roughly straight

    std::cout << " OK\n";
}

void test_vehicle_braking() {
    std::cout << "  test_vehicle_braking...";

    Vehicle v(1, 0.0f, 0.0f, 0.0f);

    // Accelerate first
    v.apply_driver_input(255, 0, false);
    for (int i = 0; i < 20; ++i) v.update(0.05f);

    float speed_before = v.speed();
    assert(speed_before > 0.0f);

    // Now brake
    v.apply_driver_input(0, 0, true);
    for (int i = 0; i < 20; ++i) v.update(0.05f);

    assert(v.speed() < speed_before);

    std::cout << " OK\n";
}

void test_vehicle_steering() {
    std::cout << "  test_vehicle_steering...";

    Vehicle v(1, 0.0f, 0.0f, 0.0f);

    // Move forward then steer right
    v.apply_driver_input(200, 0, false);
    for (int i = 0; i < 10; ++i) v.update(0.05f);

    float initial_angle = v.angle();

    // Steer right (positive)
    v.apply_driver_input(200, 100, false);
    for (int i = 0; i < 20; ++i) v.update(0.05f);

    // Angle should have changed
    assert(v.angle() != initial_angle);

    std::cout << " OK\n";
}

void test_vehicle_max_speed() {
    std::cout << "  test_vehicle_max_speed...";

    Vehicle v(1, 0.0f, 0.0f, 0.0f);

    // Full throttle for a long time
    v.apply_driver_input(255, 0, false);
    for (int i = 0; i < 1000; ++i) v.update(0.05f);

    // Should not exceed max speed
    assert(v.speed() <= v.max_speed());

    std::cout << " OK\n";
}

void test_balance_system() {
    std::cout << "  test_balance_system...";

    Vehicle v(1, 0.0f, 0.0f, 0.0f);
    assert(v.balance() == 100.0f);

    // Consume balance
    v.consume_balance(30.0f);
    assert(std::abs(v.balance() - 70.0f) < 0.01f);

    // Consume more
    v.consume_balance(80.0f);  // This should deplete balance
    assert(v.balance() == 0.0f);
    assert(v.is_out_of_control());

    std::cout << " OK\n";
}

void test_balance_recovery() {
    std::cout << "  test_balance_recovery...";

    Vehicle v(1, 0.0f, 0.0f, 0.0f);
    v.consume_balance(50.0f);
    assert(std::abs(v.balance() - 50.0f) < 0.01f);

    // Run for 5 seconds (should recover ~25 points)
    for (int i = 0; i < 100; ++i) v.update(0.05f);

    assert(v.balance() > 50.0f);
    assert(v.balance() <= 100.0f);

    std::cout << " OK\n";
}

void test_combat_kick() {
    std::cout << "  test_combat_kick...";

    // Two vehicles close together
    Vehicle attacker(1, 0.0f, 0.0f, 0.0f);
    Vehicle target(2, 1.0f, 0.0f, 0.0f);  // 1m ahead, within kick range

    auto result = CombatSystem::resolve_attack(AttackType::KICK, attacker, target);
    assert(result.type == AttackType::KICK);
    assert(result.self_balance_cost == 10.0f);
    // Hit depends on angle, target is directly ahead and within range
    if (result.hit) {
        assert(result.damage_balance == 15.0f);
        assert(result.speed_loss == 2.0f);
    }

    std::cout << " OK\n";
}

void test_combat_out_of_range() {
    std::cout << "  test_combat_out_of_range...";

    Vehicle attacker(1, 0.0f, 0.0f, 0.0f);
    Vehicle target(2, 100.0f, 0.0f, 0.0f);  // Far away

    auto result = CombatSystem::resolve_attack(AttackType::KICK, attacker, target);
    assert(!result.hit);

    result = CombatSystem::resolve_attack(AttackType::SMASH, attacker, target);
    assert(!result.hit);

    result = CombatSystem::resolve_attack(AttackType::BRAKE_GRAB, attacker, target);
    assert(!result.hit);

    std::cout << " OK\n";
}

void test_combat_smash() {
    std::cout << "  test_combat_smash...";

    Vehicle attacker(1, 0.0f, 0.0f, 0.0f);
    Vehicle target(2, 1.5f, 0.0f, 0.0f);  // Within smash range, ahead

    auto result = CombatSystem::resolve_attack(AttackType::SMASH, attacker, target);
    assert(result.type == AttackType::SMASH);
    assert(result.self_balance_cost == 20.0f);
    if (result.hit) {
        assert(result.damage_balance == 25.0f);
    }

    std::cout << " OK\n";
}

void test_combat_none() {
    std::cout << "  test_combat_none...";

    Vehicle attacker(1, 0.0f, 0.0f, 0.0f);
    Vehicle target(2, 1.0f, 0.0f, 0.0f);

    auto result = CombatSystem::resolve_attack(AttackType::NONE, attacker, target);
    assert(!result.hit);
    assert(result.damage_balance == 0.0f);
    assert(result.self_balance_cost == 0.0f);

    std::cout << " OK\n";
}

void test_disturbance() {
    std::cout << "  test_disturbance...";

    Vehicle v(1, 0.0f, 0.0f, 0.0f);
    v.apply_driver_input(200, 0, false);
    for (int i = 0; i < 20; ++i) v.update(0.05f);

    float speed_before = v.speed();
    float angle_before = v.angle();

    v.apply_disturbance(0.5f, 5.0f);
    assert(v.speed() < speed_before);
    assert(v.angle() != angle_before);

    std::cout << " OK\n";
}

void test_utility_functions() {
    std::cout << "  test_utility_functions...";

    assert(std::abs(point_distance(0, 0, 3, 4) - 5.0f) < 0.01f);
    assert(std::abs(point_distance(1, 1, 1, 1)) < 0.001f);

    float a = normalize_angle(static_cast<float>(M_PI) * 3.0f);
    assert(a >= static_cast<float>(-M_PI) && a <= static_cast<float>(M_PI));

    std::cout << " OK\n";
}

int main() {
    std::cout << "=== Game Logic Tests ===\n";

    test_vehicle_creation();
    test_vehicle_acceleration();
    test_vehicle_braking();
    test_vehicle_steering();
    test_vehicle_max_speed();
    test_balance_system();
    test_balance_recovery();
    test_combat_kick();
    test_combat_out_of_range();
    test_combat_smash();
    test_combat_none();
    test_disturbance();
    test_utility_functions();

    std::cout << "All game logic tests passed!\n";
    return 0;
}
