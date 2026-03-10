#include "game/game_room.h"
#include <iostream>
#include <algorithm>

namespace roadrage {

GameRoom::GameRoom(uint32_t room_id, boost::asio::io_context& io_ctx, const std::string& name)
    : room_id_(room_id), name_(name), tick_timer_(io_ctx)
{
}

GameRoom::~GameRoom() {
    stop_game();
}

bool GameRoom::add_player(Session::Ptr session, uint32_t player_id, PlayerRole role) {
    if (state_ != RoomState::WAITING) return false;
    if (players_.size() >= max_players_) return false;

    PlayerSlot slot;
    slot.session = session;
    slot.player_id = player_id;
    slot.role = role;
    slot.vehicle_id = 0;  // Assigned when game starts
    players_[player_id] = std::move(slot);

    std::cout << "[Room " << room_id_ << "] Player " << player_id
              << " joined as " << (role == PlayerRole::DRIVER ? "driver" : "passenger") << "\n";
    return true;
}

void GameRoom::remove_player(uint32_t player_id) {
    auto it = players_.find(player_id);
    if (it == players_.end()) return;

    players_.erase(it);
    std::cout << "[Room " << room_id_ << "] Player " << player_id << " left\n";

    // Notify others
    Message msg;
    msg.msg_id = MsgType::MSG_PLAYER_LEFT;
    msg.sequence = 0;
    ByteBuffer payload;
    payload.write_u32(player_id);
    msg.payload = std::move(payload);
    broadcast_to_room(msg);

    if (state_ == RoomState::PLAYING && players_.empty()) {
        stop_game();
    }
}

bool GameRoom::add_ai_player(uint32_t ai_id, PlayerRole role) {
    if (players_.size() >= max_players_) return false;

    PlayerSlot slot;
    slot.session = nullptr;
    slot.player_id = ai_id;
    slot.role = role;
    slot.is_ai = true;
    slot.ai = std::make_unique<AIController>(ai_id);
    players_[ai_id] = std::move(slot);

    std::cout << "[Room " << room_id_ << "] AI " << ai_id << " added\n";
    return true;
}

void GameRoom::setup_vehicles() {
    vehicles_.clear();

    // Group players into vehicle pairs (driver + passenger)
    std::vector<uint32_t> drivers, passengers;
    for (auto& [pid, slot] : players_) {
        if (slot.role == PlayerRole::DRIVER) {
            drivers.push_back(pid);
        } else {
            passengers.push_back(pid);
        }
    }

    // Create vehicles - one per driver
    float start_x = 50.0f;
    float lane_y = -3.0f;

    for (size_t i = 0; i < drivers.size(); ++i) {
        uint32_t vid = next_vehicle_id_++;
        float y = lane_y + static_cast<float>(i) * track_.lane_width;
        Vehicle v(vid, start_x, y, 0.0f);  // Facing right (angle=0)
        v.set_driver(drivers[i]);

        // Assign a passenger if available
        if (i < passengers.size()) {
            v.set_passenger(passengers[i]);
            players_[passengers[i]].vehicle_id = vid;
        }

        players_[drivers[i]].vehicle_id = vid;
        vehicles_.push_back(std::move(v));
    }

    // Handle unmatched passengers - create solo vehicles for them
    for (size_t i = drivers.size(); i < passengers.size(); ++i) {
        uint32_t vid = next_vehicle_id_++;
        float y = lane_y + static_cast<float>(i + drivers.size()) * track_.lane_width;
        Vehicle v(vid, start_x, y, 0.0f);
        v.set_passenger(passengers[i]);
        players_[passengers[i]].vehicle_id = vid;
        vehicles_.push_back(std::move(v));
    }

    std::cout << "[Room " << room_id_ << "] Created " << vehicles_.size() << " vehicles\n";
}

void GameRoom::start_game() {
    if (state_ != RoomState::WAITING) return;
    if (players_.empty()) return;

    setup_vehicles();
    state_ = RoomState::PLAYING;
    tick_count_ = 0;

    std::cout << "[Room " << room_id_ << "] Game started!\n";

    // Notify all players
    Message start_msg;
    start_msg.msg_id = MsgType::MSG_START_GAME;
    start_msg.sequence = 0;
    ByteBuffer payload;
    payload.write_u32(room_id_);
    payload.write_u8(static_cast<uint8_t>(vehicles_.size()));
    for (const auto& v : vehicles_) {
        v.snapshot().serialize(payload);
    }
    start_msg.payload = std::move(payload);
    broadcast_to_room(start_msg);

    // Start game loop
    game_tick();
}

void GameRoom::stop_game() {
    if (state_ != RoomState::PLAYING) return;
    state_ = RoomState::FINISHED;
    tick_timer_.cancel();
    std::cout << "[Room " << room_id_ << "] Game stopped\n";
}

void GameRoom::handle_input(uint32_t player_id, const InputFrame& input) {
    std::lock_guard<std::mutex> lock(input_mutex_);
    pending_inputs_.push_back({player_id, input});
}

void GameRoom::game_tick() {
    if (state_ != RoomState::PLAYING) return;

    float dt = static_cast<float>(TICK_RATE_MS) / 1000.0f;

    // Process AI
    update_ai(dt);

    // Apply pending inputs
    {
        std::lock_guard<std::mutex> lock(input_mutex_);
        for (const auto& pi : pending_inputs_) {
            auto pit = players_.find(pi.player_id);
            if (pit == players_.end()) continue;

            // Find the vehicle this player controls
            for (auto& v : vehicles_) {
                if (pit->second.role == PlayerRole::DRIVER &&
                    v.driver_id() == pi.player_id) {
                    v.apply_driver_input(pi.input.throttle, pi.input.steering, pi.input.brake);
                }
            }

            // Handle passenger attacks
            if (pit->second.role == PlayerRole::PASSENGER &&
                pi.input.attack != AttackType::NONE) {
                // Find attacker and target vehicles
                Vehicle* attacker_vehicle = nullptr;
                Vehicle* target_vehicle = nullptr;

                for (auto& v : vehicles_) {
                    if (v.passenger_id() == pi.player_id) {
                        attacker_vehicle = &v;
                    }
                    if (v.id() == pi.input.target_id ||
                        v.driver_id() == pi.input.target_id ||
                        v.passenger_id() == pi.input.target_id) {
                        target_vehicle = &v;
                    }
                }

                if (attacker_vehicle && target_vehicle && attacker_vehicle != target_vehicle) {
                    auto result = CombatSystem::resolve_attack(
                        pi.input.attack, *attacker_vehicle, *target_vehicle);

                    // Apply results
                    attacker_vehicle->consume_balance(result.self_balance_cost);

                    if (result.hit) {
                        target_vehicle->apply_disturbance(result.disturbance_torque, result.speed_loss);
                        target_vehicle->consume_balance(result.damage_balance);

                        // Broadcast attack event
                        Message event_msg;
                        event_msg.msg_id = MsgType::MSG_ATTACK_EVENT;
                        event_msg.sequence = snapshot_seq_;
                        ByteBuffer event_payload;
                        event_payload.write_u8(static_cast<uint8_t>(result.type));
                        event_payload.write_u32(result.attacker_vehicle_id);
                        event_payload.write_u32(result.target_vehicle_id);
                        event_payload.write_u8(result.hit ? 1 : 0);
                        event_payload.write_float(result.damage_balance);
                        event_msg.payload = std::move(event_payload);
                        broadcast_to_room(event_msg);
                    }
                }
            }
        }
        pending_inputs_.clear();
    }

    // Update physics
    update_physics(dt);

    // Broadcast state
    broadcast_snapshot();

    // Check win condition
    check_game_over();

    // Schedule next tick
    tick_count_++;
    auto self = shared_from_this();
    tick_timer_.expires_after(std::chrono::milliseconds(TICK_RATE_MS));
    tick_timer_.async_wait([this, self](boost::system::error_code ec) {
        if (!ec) game_tick();
    });
}

void GameRoom::update_physics(float dt) {
    for (auto& v : vehicles_) {
        v.update(dt);

        // Keep vehicles within track bounds
        float half_width = track_.width / 2.0f;
        float y = v.y();
        if (y < -half_width || y > half_width) {
            // Bounce off walls
            float clamped_y = std::clamp(y, -half_width, half_width);
            v.reset(v.x(), clamped_y, v.angle());
            // Re-apply some state
        }
    }
}

void GameRoom::update_ai(float dt) {
    for (auto& [pid, slot] : players_) {
        if (!slot.is_ai || !slot.ai) continue;

        // Find this AI's vehicle
        Vehicle* self_vehicle = nullptr;
        for (auto& v : vehicles_) {
            if (v.driver_id() == pid || v.passenger_id() == pid) {
                self_vehicle = &v;
                break;
            }
        }
        if (!self_vehicle) continue;

        // Find nearest enemy
        const Vehicle* nearest = nullptr;
        float nearest_dist = 999999.0f;
        for (const auto& v : vehicles_) {
            if (v.id() == self_vehicle->id()) continue;
            float d = point_distance(self_vehicle->x(), self_vehicle->y(), v.x(), v.y());
            if (d < nearest_dist) {
                nearest_dist = d;
                nearest = &v;
            }
        }

        InputFrame ai_input = slot.ai->update(dt, *self_vehicle, nearest);

        // Apply AI input directly
        if (slot.role == PlayerRole::DRIVER) {
            self_vehicle->apply_driver_input(ai_input.throttle, ai_input.steering, ai_input.brake);
        }

        // Handle AI passenger attacks
        if (slot.role == PlayerRole::PASSENGER && ai_input.attack != AttackType::NONE && nearest) {
            auto result = CombatSystem::resolve_attack(ai_input.attack, *self_vehicle, *nearest);
            self_vehicle->consume_balance(result.self_balance_cost);
            if (result.hit) {
                // Note: We can't modify 'nearest' through a const pointer, but we need to find the
                // actual vehicle to modify
                for (auto& v : vehicles_) {
                    if (v.id() == nearest->id()) {
                        v.apply_disturbance(result.disturbance_torque, result.speed_loss);
                        v.consume_balance(result.damage_balance);
                        break;
                    }
                }

                Message event_msg;
                event_msg.msg_id = MsgType::MSG_ATTACK_EVENT;
                event_msg.sequence = snapshot_seq_;
                ByteBuffer event_payload;
                event_payload.write_u8(static_cast<uint8_t>(result.type));
                event_payload.write_u32(result.attacker_vehicle_id);
                event_payload.write_u32(result.target_vehicle_id);
                event_payload.write_u8(1);
                event_payload.write_float(result.damage_balance);
                event_msg.payload = std::move(event_payload);
                broadcast_to_room(event_msg);
            }
        }
    }
}

void GameRoom::broadcast_snapshot() {
    Message msg;
    msg.msg_id = MsgType::MSG_SNAPSHOT;
    msg.sequence = snapshot_seq_++;

    ByteBuffer payload;
    payload.write_u32(tick_count_);
    payload.write_u8(static_cast<uint8_t>(vehicles_.size()));
    for (const auto& v : vehicles_) {
        v.snapshot().serialize(payload);
    }
    msg.payload = std::move(payload);

    broadcast_to_room(msg);
}

void GameRoom::broadcast_to_room(const Message& msg) {
    for (auto& [pid, slot] : players_) {
        if (slot.session && slot.session->is_open()) {
            slot.session->send(msg);
        }
    }
}

void GameRoom::check_game_over() {
    // Check if any vehicle reached the finish line
    float finish_line = track_.length * static_cast<float>(track_.num_laps);

    for (const auto& v : vehicles_) {
        if (v.distance() >= finish_line) {
            // Game over - this vehicle won!
            Message msg;
            msg.msg_id = MsgType::MSG_GAME_OVER;
            msg.sequence = 0;
            ByteBuffer payload;
            payload.write_u32(v.id());
            payload.write_u32(v.driver_id());
            payload.write_u32(v.passenger_id());
            msg.payload = std::move(payload);
            broadcast_to_room(msg);

            stop_game();
            return;
        }
    }
}

Message GameRoom::make_room_info_msg() const {
    Message msg;
    msg.msg_id = MsgType::MSG_ROOM_INFO;
    msg.sequence = 0;

    ByteBuffer payload;
    payload.write_u32(room_id_);
    payload.write_string(name_);
    payload.write_u8(static_cast<uint8_t>(state_));
    payload.write_u8(static_cast<uint8_t>(players_.size()));
    payload.write_u8(static_cast<uint8_t>(max_players_));

    for (const auto& [pid, slot] : players_) {
        payload.write_u32(pid);
        payload.write_u8(static_cast<uint8_t>(slot.role));
        payload.write_u8(slot.is_ai ? 1 : 0);
    }

    msg.payload = std::move(payload);
    return msg;
}

} // namespace roadrage
