#include "game/vehicle.h"
#include <algorithm>
#include <random>

namespace roadrage {

// Thread-local random engine for out-of-control swerving
static thread_local std::mt19937 t_rng{std::random_device{}()};
static thread_local std::uniform_real_distribution<float> t_swerve_dist(-1.0f, 1.0f);

Vehicle::Vehicle(uint32_t id, float start_x, float start_y, float start_angle)
    : id_(id), pos_x_(start_x), pos_y_(start_y), angle_(start_angle)
{
}

void Vehicle::update(float dt) {
    // Handle out-of-control state
    if (out_of_control_timer_ > 0.0f) {
        out_of_control_timer_ -= dt;
        // Random swerving + reduced speed
        speed_ *= 0.95f;
        angle_ += t_swerve_dist(t_rng) * 2.0f * dt;
        pos_x_ += std::cos(angle_) * speed_ * dt;
        pos_y_ += std::sin(angle_) * speed_ * dt;
        distance_traveled_ += std::abs(speed_) * dt;
        return;
    }

    // Balance affects steering sensitivity
    float balance_factor = balance_ / 100.0f;
    float effective_steering = steering_sensitivity_ * balance_factor;

    // Apply throttle
    if (throttle_input_ > 0.0f && !brake_input_) {
        speed_ += acceleration_ * throttle_input_ * dt;
    }

    // Apply braking
    if (brake_input_) {
        speed_ -= brake_decel_ * dt;
        if (speed_ < 0.0f) speed_ = 0.0f;
    }

    // Apply friction
    if (speed_ > 0.0f) {
        speed_ -= friction_ * dt;
        if (speed_ < 0.0f) speed_ = 0.0f;
    }

    // Clamp speed
    speed_ = std::clamp(speed_, 0.0f, max_speed_);

    // Apply steering (only when moving)
    if (speed_ > 0.5f) {
        angle_ += steering_input_ * effective_steering * dt;
        angle_ = normalize_angle(angle_);
    }

    // Update position
    pos_x_ += std::cos(angle_) * speed_ * dt;
    pos_y_ += std::sin(angle_) * speed_ * dt;

    // Track distance
    distance_traveled_ += speed_ * dt;

    // Passive balance recovery (5 pts/sec when driving smoothly)
    recover_balance(dt);
}

void Vehicle::apply_driver_input(uint8_t throttle, int8_t steering, bool brake) {
    throttle_input_ = static_cast<float>(throttle) / 255.0f;
    steering_input_ = static_cast<float>(steering) / 127.0f;
    brake_input_ = brake;
}

void Vehicle::apply_disturbance(float torque, float speed_loss) {
    angle_ += torque;
    speed_ = std::max(0.0f, speed_ - speed_loss);
}

void Vehicle::consume_balance(float amount) {
    balance_ -= amount;
    if (balance_ <= 0.0f) {
        balance_ = 0.0f;
        out_of_control_timer_ = 1.0f; // 1 second loss of control
    }
}

void Vehicle::recover_balance(float dt) {
    if (balance_ < 100.0f && out_of_control_timer_ <= 0.0f) {
        // Recover 5 points per second
        balance_ = std::min(100.0f, balance_ + 5.0f * dt);
    }
}

VehicleSnapshot Vehicle::snapshot() const {
    VehicleSnapshot s;
    s.vehicle_id = id_;
    s.pos_x = pos_x_;
    s.pos_y = pos_y_;
    s.angle = angle_;
    s.speed = speed_;
    s.balance = balance_;
    s.driver_id = driver_id_;
    s.passenger_id = passenger_id_;
    return s;
}

void Vehicle::reset(float x, float y, float angle) {
    pos_x_ = x;
    pos_y_ = y;
    angle_ = angle;
    speed_ = 0.0f;
    balance_ = 100.0f;
    out_of_control_timer_ = 0.0f;
    distance_traveled_ = 0.0f;
    throttle_input_ = 0.0f;
    steering_input_ = 0.0f;
    brake_input_ = false;
}

} // namespace roadrage
