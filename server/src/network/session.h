#pragma once

#include <boost/asio.hpp>
#include <memory>
#include <deque>
#include <functional>
#include <vector>
#include <string>
#include "network/protocol.h"

namespace roadrage {

class Session : public std::enable_shared_from_this<Session> {
public:
    using Ptr = std::shared_ptr<Session>;
    using MessageHandler = std::function<void(Ptr, const Message&)>;
    using DisconnectHandler = std::function<void(Ptr)>;

    Session(boost::asio::ip::tcp::socket socket, uint32_t session_id);

    void start();
    void send(const Message& msg);
    void close();

    uint32_t session_id() const { return session_id_; }
    uint32_t player_id() const { return player_id_; }
    void set_player_id(uint32_t id) { player_id_ = id; }
    const std::string& username() const { return username_; }
    void set_username(const std::string& name) { username_ = name; }
    bool is_open() const { return is_open_; }

    void set_message_handler(MessageHandler handler) { on_message_ = std::move(handler); }
    void set_disconnect_handler(DisconnectHandler handler) { on_disconnect_ = std::move(handler); }

private:
    void do_read_header();
    void do_read_body(size_t body_len);
    void do_write();

    boost::asio::ip::tcp::socket socket_;
    uint32_t session_id_;
    uint32_t player_id_ = 0;
    std::string username_;
    bool is_open_ = true;

    // Read buffer (header + body staged reading)
    std::vector<uint8_t> read_buf_;
    uint8_t header_buf_[HEADER_SIZE];

    // Write queue
    std::deque<std::vector<uint8_t>> write_queue_;

    MessageHandler on_message_;
    DisconnectHandler on_disconnect_;
};

} // namespace roadrage
