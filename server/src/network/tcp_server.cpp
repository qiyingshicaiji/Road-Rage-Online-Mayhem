#include "network/tcp_server.h"
#include <iostream>

namespace roadrage {

TcpServer::TcpServer(boost::asio::io_context& io_ctx, uint16_t port)
    : io_ctx_(io_ctx),
      acceptor_(io_ctx, boost::asio::ip::tcp::endpoint(boost::asio::ip::tcp::v4(), port))
{
    acceptor_.set_option(boost::asio::ip::tcp::acceptor::reuse_address(true));
}

void TcpServer::start() {
    std::cout << "[Server] Listening on port " << acceptor_.local_endpoint().port() << "\n";
    do_accept();
}

void TcpServer::stop() {
    acceptor_.close();
    std::lock_guard<std::mutex> lock(sessions_mutex_);
    for (auto& [id, session] : sessions_) {
        session->close();
    }
    sessions_.clear();
}

void TcpServer::do_accept() {
    acceptor_.async_accept(
        [this](boost::system::error_code ec, boost::asio::ip::tcp::socket socket) {
            if (ec) {
                if (ec != boost::asio::error::operation_aborted) {
                    std::cerr << "[Server] Accept error: " << ec.message() << "\n";
                }
                return;
            }

            uint32_t sid = next_session_id_++;
            auto session = std::make_shared<Session>(std::move(socket), sid);

            {
                std::lock_guard<std::mutex> lock(sessions_mutex_);
                sessions_[sid] = session;
            }

            std::cout << "[Server] New connection: session " << sid << "\n";

            session->set_message_handler(
                [this](Session::Ptr s, const Message& msg) {
                    if (on_message_) on_message_(s, msg);
                });

            session->set_disconnect_handler(
                [this](Session::Ptr s) {
                    std::cout << "[Server] Disconnected: session " << s->session_id() << "\n";
                    {
                        std::lock_guard<std::mutex> lock(sessions_mutex_);
                        sessions_.erase(s->session_id());
                    }
                    if (on_disconnect_) on_disconnect_(s);
                });

            if (on_connect_) on_connect_(session);
            session->start();
            do_accept();
        });
}

void TcpServer::broadcast(const Message& msg) {
    std::lock_guard<std::mutex> lock(sessions_mutex_);
    for (auto& [id, session] : sessions_) {
        if (session->is_open()) {
            session->send(msg);
        }
    }
}

Session::Ptr TcpServer::get_session(uint32_t session_id) {
    std::lock_guard<std::mutex> lock(sessions_mutex_);
    auto it = sessions_.find(session_id);
    return (it != sessions_.end()) ? it->second : nullptr;
}

} // namespace roadrage
