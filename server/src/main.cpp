/**
 * Road Rage Online Mayhem - Game Server
 *
 * C++ authoritative game server with:
 * - Boost.Asio TCP networking
 * - Binary protocol (custom message format)
 * - Room management
 * - Vehicle physics (50ms fixed timestep)
 * - Combat system (kick, brake grab, smash)
 * - Balance system (0-100)
 * - AI opponents (state machine)
 * - SQLite persistence
 */

#include "network/tcp_server.h"
#include "network/protocol.h"
#include "game/game_room.h"
#include "data/database.h"

#include <boost/asio.hpp>
#include <iostream>
#include <unordered_map>
#include <memory>
#include <mutex>
#include <csignal>

using namespace roadrage;

class GameServer {
public:
    GameServer(boost::asio::io_context& io_ctx, uint16_t port)
        : io_ctx_(io_ctx), tcp_server_(io_ctx, port)
    {
        // Initialize database
        db_.open("roadrage.db");

        // Setup handlers
        tcp_server_.set_connect_handler(
            [this](Session::Ptr s) { on_connect(s); });
        tcp_server_.set_disconnect_handler(
            [this](Session::Ptr s) { on_disconnect(s); });
        tcp_server_.set_message_handler(
            [this](Session::Ptr s, const Message& msg) { on_message(s, msg); });
    }

    void start() {
        tcp_server_.start();
        std::cout << "=== Road Rage Online Mayhem - Game Server ===\n";
        std::cout << "Server ready. Waiting for connections...\n";
    }

    void stop() {
        tcp_server_.stop();
        db_.close();
    }

private:
    void on_connect(Session::Ptr session) {
        std::cout << "[GameServer] New connection: session " << session->session_id() << "\n";
    }

    void on_disconnect(Session::Ptr session) {
        uint32_t pid = session->player_id();
        if (pid == 0) return;

        // Remove from room
        std::lock_guard<std::mutex> lock(rooms_mutex_);
        for (auto& [rid, room] : rooms_) {
            room->remove_player(pid);
        }

        // Remove player mapping
        player_sessions_.erase(pid);
    }

    void on_message(Session::Ptr session, const Message& msg) {
        switch (msg.msg_id) {
            case MsgType::MSG_LOGIN:     handle_login(session, msg); break;
            case MsgType::MSG_CREATE_ROOM: handle_create_room(session, msg); break;
            case MsgType::MSG_JOIN_ROOM:   handle_join_room(session, msg); break;
            case MsgType::MSG_INPUT:       handle_input(session, msg); break;
            case MsgType::MSG_START_GAME:  handle_start_game(session, msg); break;
            case MsgType::MSG_LEAVE_ROOM:  handle_leave_room(session, msg); break;
            case MsgType::MSG_ROOM_LIST:   handle_room_list(session, msg); break;
            case MsgType::MSG_PING:        handle_ping(session, msg); break;
            default:
                std::cerr << "[GameServer] Unknown message: 0x"
                          << std::hex << static_cast<int>(msg.msg_id) << std::dec << "\n";
                break;
        }
    }

    void handle_login(Session::Ptr session, const Message& msg) {
        ByteBuffer payload(msg.payload.data());
        std::string username = payload.read_string();
        std::string password = payload.read_string();

        std::cout << "[GameServer] Login attempt: " << username << "\n";

        uint32_t user_id = 0;
        bool success = db_.authenticate(username, password, user_id);

        if (!success) {
            // Auto-register new users
            db_.create_user(username, password);
            success = db_.authenticate(username, password, user_id);
        }

        Message resp;
        resp.msg_id = MsgType::MSG_LOGIN_RESP;
        resp.sequence = msg.sequence;
        ByteBuffer resp_payload;

        if (success) {
            session->set_player_id(user_id);
            session->set_username(username);
            player_sessions_[user_id] = session;

            resp_payload.write_u8(1);  // Success
            resp_payload.write_u32(user_id);
            resp_payload.write_string(username);
            std::cout << "[GameServer] Login success: " << username << " (id=" << user_id << ")\n";
        } else {
            resp_payload.write_u8(0);  // Failure
            resp_payload.write_u32(0);
            resp_payload.write_string("Login failed");
        }

        resp.payload = std::move(resp_payload);
        session->send(resp);
    }

    void handle_create_room(Session::Ptr session, const Message& msg) {
        if (session->player_id() == 0) return;

        ByteBuffer payload(msg.payload.data());
        std::string room_name = payload.read_string();
        uint8_t role = payload.read_u8();
        uint8_t add_ai = payload.read_u8();

        uint32_t room_id;
        {
            std::lock_guard<std::mutex> lock(rooms_mutex_);
            room_id = next_room_id_++;
            auto room = std::make_shared<GameRoom>(room_id, io_ctx_, room_name);
            room->add_player(session, session->player_id(),
                             static_cast<PlayerRole>(role));

            // Add AI opponents if requested
            if (add_ai > 0) {
                uint32_t ai_base = 10000;
                for (uint8_t i = 0; i < add_ai && i < 4; ++i) {
                    uint32_t ai_id = ai_base + room_id * 10 + i;
                    // Alternate between drivers and passengers for AI
                    PlayerRole ai_role = (i % 2 == 0) ? PlayerRole::DRIVER : PlayerRole::PASSENGER;
                    room->add_ai_player(ai_id, ai_role);
                }
            }

            rooms_[room_id] = room;
            player_rooms_[session->player_id()] = room_id;
        }

        std::cout << "[GameServer] Room created: " << room_name << " (id=" << room_id << ")\n";

        // Send room info back
        std::lock_guard<std::mutex> lock(rooms_mutex_);
        auto& room = rooms_[room_id];
        session->send(room->make_room_info_msg());
    }

    void handle_join_room(Session::Ptr session, const Message& msg) {
        if (session->player_id() == 0) return;

        ByteBuffer payload(msg.payload.data());
        uint32_t room_id = payload.read_u32();
        uint8_t role = payload.read_u8();

        std::lock_guard<std::mutex> lock(rooms_mutex_);
        auto it = rooms_.find(room_id);
        if (it == rooms_.end()) {
            // Room not found
            Message resp;
            resp.msg_id = MsgType::MSG_ROOM_INFO;
            resp.sequence = msg.sequence;
            ByteBuffer rp;
            rp.write_u32(0);  // Invalid room
            rp.write_string("Room not found");
            rp.write_u8(0);
            rp.write_u8(0);
            rp.write_u8(0);
            resp.payload = std::move(rp);
            session->send(resp);
            return;
        }

        bool added = it->second->add_player(session, session->player_id(),
                                              static_cast<PlayerRole>(role));
        if (added) {
            player_rooms_[session->player_id()] = room_id;
        }

        session->send(it->second->make_room_info_msg());
    }

    void handle_input(Session::Ptr session, const Message& msg) {
        uint32_t pid = session->player_id();
        if (pid == 0) return;

        ByteBuffer payload(msg.payload.data());
        InputFrame input = InputFrame::deserialize(payload);

        // Find player's room
        auto rit = player_rooms_.find(pid);
        if (rit == player_rooms_.end()) return;

        std::lock_guard<std::mutex> lock(rooms_mutex_);
        auto room_it = rooms_.find(rit->second);
        if (room_it != rooms_.end()) {
            room_it->second->handle_input(pid, input);
        }
    }

    void handle_start_game(Session::Ptr session, const Message& msg) {
        uint32_t pid = session->player_id();
        if (pid == 0) return;

        auto rit = player_rooms_.find(pid);
        if (rit == player_rooms_.end()) return;

        std::lock_guard<std::mutex> lock(rooms_mutex_);
        auto room_it = rooms_.find(rit->second);
        if (room_it != rooms_.end()) {
            room_it->second->start_game();
        }
    }

    void handle_leave_room(Session::Ptr session, const Message& msg) {
        uint32_t pid = session->player_id();
        if (pid == 0) return;

        auto rit = player_rooms_.find(pid);
        if (rit == player_rooms_.end()) return;

        std::lock_guard<std::mutex> lock(rooms_mutex_);
        auto room_it = rooms_.find(rit->second);
        if (room_it != rooms_.end()) {
            room_it->second->remove_player(pid);
        }
        player_rooms_.erase(pid);
    }

    void handle_room_list(Session::Ptr session, const Message& msg) {
        Message resp;
        resp.msg_id = MsgType::MSG_ROOM_LIST;
        resp.sequence = msg.sequence;

        ByteBuffer payload;
        std::lock_guard<std::mutex> lock(rooms_mutex_);
        payload.write_u16(static_cast<uint16_t>(rooms_.size()));
        for (auto& [rid, room] : rooms_) {
            payload.write_u32(room->id());
            payload.write_string(room->name());
            payload.write_u8(static_cast<uint8_t>(room->state()));
            payload.write_u8(static_cast<uint8_t>(room->player_count()));
        }
        resp.payload = std::move(payload);
        session->send(resp);
    }

    void handle_ping(Session::Ptr session, const Message& msg) {
        Message pong;
        pong.msg_id = MsgType::MSG_PONG;
        pong.sequence = msg.sequence;
        session->send(pong);
    }

    boost::asio::io_context& io_ctx_;
    TcpServer tcp_server_;
    Database db_;

    std::mutex rooms_mutex_;
    std::unordered_map<uint32_t, GameRoom::Ptr> rooms_;
    std::unordered_map<uint32_t, Session::Ptr> player_sessions_;
    std::unordered_map<uint32_t, uint32_t> player_rooms_;  // player_id -> room_id
    uint32_t next_room_id_ = 1;
};

static boost::asio::io_context* g_io_ctx = nullptr;

void signal_handler(int sig) {
    std::cout << "\nShutting down...\n";
    if (g_io_ctx) g_io_ctx->stop();
}

int main(int argc, char* argv[]) {
    uint16_t port = 9527;
    if (argc > 1) {
        port = static_cast<uint16_t>(std::atoi(argv[1]));
    }

    try {
        boost::asio::io_context io_ctx;
        g_io_ctx = &io_ctx;

        std::signal(SIGINT, signal_handler);
        std::signal(SIGTERM, signal_handler);

        GameServer server(io_ctx, port);
        server.start();

        io_ctx.run();

        server.stop();
    } catch (const std::exception& e) {
        std::cerr << "Fatal error: " << e.what() << "\n";
        return 1;
    }

    return 0;
}
