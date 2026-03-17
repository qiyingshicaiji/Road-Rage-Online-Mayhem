#include "network/session.h"
#include <iostream>

namespace roadrage {

Session::Session(boost::asio::ip::tcp::socket socket, uint32_t session_id)
    : socket_(std::move(socket)), session_id_(session_id)
{
}

void Session::start() {
    do_read_header();
}

void Session::send(const Message& msg) {
    auto data = msg.serialize();
    auto self = shared_from_this();
    boost::asio::post(socket_.get_executor(),
        [this, self, data = std::move(data)]() mutable {
            bool writing = !write_queue_.empty();
            write_queue_.push_back(std::move(data));
            if (!writing) {
                do_write();
            }
        });
}

void Session::close() {
    if (!is_open_) return;
    is_open_ = false;
    boost::system::error_code ec;
    socket_.shutdown(boost::asio::ip::tcp::socket::shutdown_both, ec);
    socket_.close(ec);
}

void Session::do_read_header() {
    auto self = shared_from_this();
    boost::asio::async_read(socket_,
        boost::asio::buffer(header_buf_, HEADER_SIZE),
        [this, self](boost::system::error_code ec, std::size_t /*length*/) {
            if (ec) {
                is_open_ = false;
                if (on_disconnect_) on_disconnect_(self);
                return;
            }
            // Parse header to get body length
            uint16_t body_len = (static_cast<uint16_t>(header_buf_[4]) << 8) |
                                 static_cast<uint16_t>(header_buf_[5]);
            if (body_len > MAX_MSG_SIZE - HEADER_SIZE) {
                std::cerr << "[Session " << session_id_ << "] Message too large: " << body_len << "\n";
                close();
                if (on_disconnect_) on_disconnect_(self);
                return;
            }
            if (body_len == 0) {
                // No body, parse message immediately
                Message msg;
                msg.msg_id = static_cast<MsgType>(
                    (static_cast<uint16_t>(header_buf_[0]) << 8) | header_buf_[1]);
                msg.sequence = (static_cast<uint16_t>(header_buf_[2]) << 8) | header_buf_[3];
                if (on_message_) on_message_(self, msg);
                do_read_header();
            } else {
                do_read_body(body_len);
            }
        });
}

void Session::do_read_body(size_t body_len) {
    read_buf_.resize(body_len);
    auto self = shared_from_this();
    boost::asio::async_read(socket_,
        boost::asio::buffer(read_buf_.data(), body_len),
        [this, self](boost::system::error_code ec, std::size_t /*length*/) {
            if (ec) {
                is_open_ = false;
                if (on_disconnect_) on_disconnect_(self);
                return;
            }
            // Build full message
            Message msg;
            msg.msg_id = static_cast<MsgType>(
                (static_cast<uint16_t>(header_buf_[0]) << 8) | header_buf_[1]);
            msg.sequence = (static_cast<uint16_t>(header_buf_[2]) << 8) | header_buf_[3];
            msg.payload = ByteBuffer(std::move(read_buf_));
            if (on_message_) on_message_(self, msg);
            do_read_header();
        });
}

void Session::do_write() {
    auto self = shared_from_this();
    boost::asio::async_write(socket_,
        boost::asio::buffer(write_queue_.front().data(), write_queue_.front().size()),
        [this, self](boost::system::error_code ec, std::size_t /*length*/) {
            if (ec) {
                is_open_ = false;
                return;
            }
            write_queue_.pop_front();
            if (!write_queue_.empty()) {
                do_write();
            }
        });
}

} // namespace roadrage
