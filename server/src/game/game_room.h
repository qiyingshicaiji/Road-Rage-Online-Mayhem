#pragma once

#include "game/vehicle.h"
#include "game/combat.h"
#include "game/ai_controller.h"
#include "network/session.h"
#include "network/protocol.h"

#include <boost/asio.hpp>
#include <memory>
#include <unordered_map>
#include <vector>
#include <string>
#include <mutex>
#include <chrono>

namespace roadrage {

enum class RoomState {
    WAITING,
    PLAYING,
    FINISHED,
};

struct PlayerSlot {
    Session::Ptr session;
    uint32_t player_id;
    PlayerRole role;
    uint32_t vehicle_id;     // Which vehicle this player is on
    bool is_ai = false;
    std::unique_ptr<AIController> ai;
};

class GameRoom : public std::enable_shared_from_this<GameRoom> {
public:
    using Ptr = std::shared_ptr<GameRoom>;

    GameRoom(uint32_t room_id, boost::asio::io_context& io_ctx, const std::string& name);
    ~GameRoom();

    // Room management
    bool add_player(Session::Ptr session, uint32_t player_id, PlayerRole role);
    void remove_player(uint32_t player_id);
    bool add_ai_player(uint32_t ai_id, PlayerRole role);
    void start_game();
    void stop_game();

    // Handle player input
    void handle_input(uint32_t player_id, const InputFrame& input);

    // Getters
    uint32_t id() const { return room_id_; }
    const std::string& name() const { return name_; }
    RoomState state() const { return state_; }
    size_t player_count() const { return players_.size(); }
    bool is_full() const { return players_.size() >= max_players_; }

    // Serialize room info for clients
    Message make_room_info_msg() const;

private:
    void game_tick();
    void update_physics(float dt);
    void process_attacks();
    void update_ai(float dt);
    void broadcast_snapshot();
    void broadcast_to_room(const Message& msg);
    void check_game_over();
    void setup_vehicles();

    uint32_t room_id_;
    std::string name_;
    RoomState state_ = RoomState::WAITING;
    size_t max_players_ = 6;  // 3 motorcycles × 2 players

    TrackConfig track_;

    // Players and vehicles
    std::unordered_map<uint32_t, PlayerSlot> players_;
    std::vector<Vehicle> vehicles_;
    uint32_t next_vehicle_id_ = 1;

    // Pending inputs
    struct PendingInput {
        uint32_t player_id;
        InputFrame input;
    };
    std::vector<PendingInput> pending_inputs_;
    std::mutex input_mutex_;

    // Game loop timer
    boost::asio::steady_timer tick_timer_;
    static constexpr int TICK_RATE_MS = 50;  // 20 ticks/sec = 50ms per tick
    uint32_t tick_count_ = 0;
    uint16_t snapshot_seq_ = 0;
};

} // namespace roadrage
