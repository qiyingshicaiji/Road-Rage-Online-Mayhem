#pragma once

#include <boost/asio.hpp>
#include <memory>
#include <unordered_map>
#include <functional>
#include <mutex>
#include "network/session.h"

namespace roadrage {

class TcpServer {
public:
    using MessageHandler = std::function<void(Session::Ptr, const Message&)>;
    using ConnectHandler = std::function<void(Session::Ptr)>;
    using DisconnectHandler = std::function<void(Session::Ptr)>;

    TcpServer(boost::asio::io_context& io_ctx, uint16_t port);

    void start();
    void stop();

    void set_message_handler(MessageHandler handler) { on_message_ = std::move(handler); }
    void set_connect_handler(ConnectHandler handler) { on_connect_ = std::move(handler); }
    void set_disconnect_handler(DisconnectHandler handler) { on_disconnect_ = std::move(handler); }

    void broadcast(const Message& msg);
    Session::Ptr get_session(uint32_t session_id);

private:
    void do_accept();

    boost::asio::io_context& io_ctx_;
    boost::asio::ip::tcp::acceptor acceptor_;
    uint32_t next_session_id_ = 1;

    std::mutex sessions_mutex_;
    std::unordered_map<uint32_t, Session::Ptr> sessions_;

    MessageHandler on_message_;
    ConnectHandler on_connect_;
    DisconnectHandler on_disconnect_;
};

} // namespace roadrage
