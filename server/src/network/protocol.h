#pragma once

#include <cstdint>
#include <cstring>
#include <string>
#include <vector>
#include <stdexcept>

namespace roadrage {

// Message IDs as specified in the design document
enum class MsgType : uint16_t {
    MSG_LOGIN          = 0x0001,  // C→S: Login request
    MSG_LOGIN_RESP     = 0x0002,  // S→C: Login response
    MSG_CREATE_ROOM    = 0x0003,  // C→S: Create room
    MSG_JOIN_ROOM      = 0x0004,  // C→S: Join room
    MSG_ROOM_INFO      = 0x0005,  // S→C: Room state
    MSG_INPUT          = 0x0006,  // C→S: Input frame
    MSG_SNAPSHOT       = 0x0007,  // S→C: Game state snapshot
    MSG_ATTACK_EVENT   = 0x0008,  // S→C: Attack notification
    MSG_START_GAME     = 0x0009,  // C→S/S→C: Start game
    MSG_LEAVE_ROOM     = 0x000A,  // C→S: Leave room
    MSG_ROOM_LIST      = 0x000B,  // S→C: Available rooms
    MSG_PLAYER_LEFT    = 0x000C,  // S→C: Player left notification
    MSG_GAME_OVER      = 0x000D,  // S→C: Game over
    MSG_PING           = 0x00FE,  // C→S: Ping
    MSG_PONG           = 0x00FF,  // S→C: Pong
};

// Message header: [MsgID(2)][Seq(2)][DataLen(2)] = 6 bytes
constexpr size_t HEADER_SIZE = 6;
constexpr size_t MAX_MSG_SIZE = 65536;

// Player roles
enum class PlayerRole : uint8_t {
    NONE      = 0,
    DRIVER    = 1,
    PASSENGER = 2,
};

// Attack types from passenger
enum class AttackType : uint8_t {
    NONE       = 0,
    KICK       = 1,  // Kicking
    BRAKE_GRAB = 2,  // Grab opponent's brake
    SMASH      = 3,  // Weapon smash
};

// A binary buffer for building/reading messages
class ByteBuffer {
public:
    ByteBuffer() = default;
    explicit ByteBuffer(const std::vector<uint8_t>& data) : data_(data), read_pos_(0) {}
    explicit ByteBuffer(std::vector<uint8_t>&& data) : data_(std::move(data)), read_pos_(0) {}

    // Write operations
    void write_u8(uint8_t val) { data_.push_back(val); }
    void write_u16(uint16_t val) {
        data_.push_back(static_cast<uint8_t>(val >> 8));
        data_.push_back(static_cast<uint8_t>(val & 0xFF));
    }
    void write_i16(int16_t val) { write_u16(static_cast<uint16_t>(val)); }
    void write_u32(uint32_t val) {
        data_.push_back(static_cast<uint8_t>((val >> 24) & 0xFF));
        data_.push_back(static_cast<uint8_t>((val >> 16) & 0xFF));
        data_.push_back(static_cast<uint8_t>((val >> 8) & 0xFF));
        data_.push_back(static_cast<uint8_t>(val & 0xFF));
    }
    void write_float(float val) {
        uint32_t bits;
        std::memcpy(&bits, &val, sizeof(bits));
        write_u32(bits);
    }
    void write_string(const std::string& str) {
        write_u16(static_cast<uint16_t>(str.size()));
        data_.insert(data_.end(), str.begin(), str.end());
    }

    // Read operations
    uint8_t read_u8() {
        check_read(1);
        return data_[read_pos_++];
    }
    uint16_t read_u16() {
        check_read(2);
        uint16_t val = (static_cast<uint16_t>(data_[read_pos_]) << 8) |
                        static_cast<uint16_t>(data_[read_pos_ + 1]);
        read_pos_ += 2;
        return val;
    }
    int16_t read_i16() { return static_cast<int16_t>(read_u16()); }
    uint32_t read_u32() {
        check_read(4);
        uint32_t val = (static_cast<uint32_t>(data_[read_pos_]) << 24) |
                       (static_cast<uint32_t>(data_[read_pos_ + 1]) << 16) |
                       (static_cast<uint32_t>(data_[read_pos_ + 2]) << 8) |
                        static_cast<uint32_t>(data_[read_pos_ + 3]);
        read_pos_ += 4;
        return val;
    }
    float read_float() {
        uint32_t bits = read_u32();
        float val;
        std::memcpy(&val, &bits, sizeof(val));
        return val;
    }
    std::string read_string() {
        uint16_t len = read_u16();
        check_read(len);
        std::string str(data_.begin() + read_pos_, data_.begin() + read_pos_ + len);
        read_pos_ += len;
        return str;
    }

    size_t remaining() const { return data_.size() - read_pos_; }
    const std::vector<uint8_t>& data() const { return data_; }
    size_t size() const { return data_.size(); }
    void clear() { data_.clear(); read_pos_ = 0; }

private:
    void check_read(size_t n) {
        if (read_pos_ + n > data_.size()) {
            throw std::runtime_error("ByteBuffer: read past end");
        }
    }
    std::vector<uint8_t> data_;
    size_t read_pos_ = 0;
};

// Represents a complete network message
struct Message {
    MsgType msg_id;
    uint16_t sequence;
    ByteBuffer payload;

    // Serialize the full message (header + payload) into bytes
    std::vector<uint8_t> serialize() const;

    // Try to parse one message from a byte stream. Returns bytes consumed, 0 if incomplete.
    static size_t try_parse(const uint8_t* data, size_t len, Message& out);
};

// Input frame from a player (driver or passenger)
struct InputFrame {
    uint8_t throttle;      // 0-255
    int8_t steering;       // -127 to 127
    bool brake;
    AttackType attack;
    uint32_t target_id;    // Target player for attack

    void serialize(ByteBuffer& buf) const;
    static InputFrame deserialize(ByteBuffer& buf);
};

// Vehicle state for snapshot
struct VehicleSnapshot {
    uint32_t vehicle_id;
    float pos_x, pos_y;
    float angle;           // Radians
    float speed;
    float balance;         // 0-100
    uint32_t driver_id;
    uint32_t passenger_id;

    void serialize(ByteBuffer& buf) const;
    static VehicleSnapshot deserialize(ByteBuffer& buf);
};

} // namespace roadrage
