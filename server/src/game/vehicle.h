#pragma once

#include <cmath>
#include <cstdint>
#include "network/protocol.h"

namespace roadrage {

// Track configuration
struct TrackConfig {
    float length = 2000.0f;     // Track length in meters
    float width  = 12.0f;       // Track width in meters
    float lane_width = 3.0f;    // Lane width
    int num_laps = 3;           // Laps to finish
};

// Vehicle state - server-authoritative physics
class Vehicle {
public:
    Vehicle(uint32_t id, float start_x, float start_y, float start_angle);

    // Update physics with a fixed timestep (50ms)
    void update(float dt);

    // Apply driver input
    void apply_driver_input(uint8_t throttle, int8_t steering, bool brake);

    // Apply disturbance from attacks
    void apply_disturbance(float torque, float speed_loss);

    // Balance system
    void consume_balance(float amount);
    void recover_balance(float dt);
    bool is_out_of_control() const { return out_of_control_timer_ > 0.0f; }

    // Getters
    uint32_t id() const { return id_; }
    float x() const { return pos_x_; }
    float y() const { return pos_y_; }
    float angle() const { return angle_; }
    float speed() const { return speed_; }
    float balance() const { return balance_; }
    float max_speed() const { return max_speed_; }

    uint32_t driver_id() const { return driver_id_; }
    uint32_t passenger_id() const { return passenger_id_; }
    void set_driver(uint32_t id) { driver_id_ = id; }
    void set_passenger(uint32_t id) { passenger_id_ = id; }

    // Distance traveled (for lap tracking)
    float distance() const { return distance_traveled_; }

    // Snapshot
    VehicleSnapshot snapshot() const;

    // Reset to start
    void reset(float x, float y, float angle);

private:
    uint32_t id_;
    float pos_x_, pos_y_;
    float angle_;            // Direction in radians
    float speed_ = 0.0f;    // Current speed m/s
    float max_speed_ = 30.0f; // ~108 km/h
    float acceleration_ = 15.0f;
    float brake_decel_ = 25.0f;
    float friction_ = 3.0f;
    float steering_sensitivity_ = 2.5f;

    float balance_ = 100.0f;
    float out_of_control_timer_ = 0.0f;
    float distance_traveled_ = 0.0f;

    uint32_t driver_id_ = 0;
    uint32_t passenger_id_ = 0;

    // Current input state
    float throttle_input_ = 0.0f;   // 0-1
    float steering_input_ = 0.0f;   // -1 to 1
    bool brake_input_ = false;
};

// Utility: distance between two points
inline float point_distance(float x1, float y1, float x2, float y2) {
    float dx = x2 - x1;
    float dy = y2 - y1;
    return std::sqrt(dx * dx + dy * dy);
}

// Utility: angle between two points
inline float point_angle(float x1, float y1, float x2, float y2) {
    return std::atan2(y2 - y1, x2 - x1);
}

// Utility: normalize angle to [-PI, PI]
inline float normalize_angle(float a) {
    while (a > M_PI) a -= 2.0f * static_cast<float>(M_PI);
    while (a < -M_PI) a += 2.0f * static_cast<float>(M_PI);
    return a;
}

} // namespace roadrage
