#include "network/protocol.h"

namespace roadrage {

std::vector<uint8_t> Message::serialize() const {
    ByteBuffer header;
    header.write_u16(static_cast<uint16_t>(msg_id));
    header.write_u16(sequence);
    header.write_u16(static_cast<uint16_t>(payload.size()));

    std::vector<uint8_t> result;
    result.reserve(HEADER_SIZE + payload.size());
    result.insert(result.end(), header.data().begin(), header.data().end());
    result.insert(result.end(), payload.data().begin(), payload.data().end());
    return result;
}

size_t Message::try_parse(const uint8_t* data, size_t len, Message& out) {
    if (len < HEADER_SIZE) return 0;

    uint16_t msg_id = (static_cast<uint16_t>(data[0]) << 8) | data[1];
    uint16_t seq    = (static_cast<uint16_t>(data[2]) << 8) | data[3];
    uint16_t dlen   = (static_cast<uint16_t>(data[4]) << 8) | data[5];

    size_t total = HEADER_SIZE + dlen;
    if (len < total) return 0;
    if (total > MAX_MSG_SIZE) {
        throw std::runtime_error("Message too large");
    }

    out.msg_id = static_cast<MsgType>(msg_id);
    out.sequence = seq;
    out.payload = ByteBuffer(
        std::vector<uint8_t>(data + HEADER_SIZE, data + total)
    );
    return total;
}

void InputFrame::serialize(ByteBuffer& buf) const {
    buf.write_u8(throttle);
    buf.write_u8(static_cast<uint8_t>(steering));
    buf.write_u8(brake ? 1 : 0);
    buf.write_u8(static_cast<uint8_t>(attack));
    buf.write_u32(target_id);
}

InputFrame InputFrame::deserialize(ByteBuffer& buf) {
    InputFrame f;
    f.throttle  = buf.read_u8();
    f.steering  = static_cast<int8_t>(buf.read_u8());
    f.brake     = buf.read_u8() != 0;
    f.attack    = static_cast<AttackType>(buf.read_u8());
    f.target_id = buf.read_u32();
    return f;
}

void VehicleSnapshot::serialize(ByteBuffer& buf) const {
    buf.write_u32(vehicle_id);
    buf.write_float(pos_x);
    buf.write_float(pos_y);
    buf.write_float(angle);
    buf.write_float(speed);
    buf.write_float(balance);
    buf.write_u32(driver_id);
    buf.write_u32(passenger_id);
}

VehicleSnapshot VehicleSnapshot::deserialize(ByteBuffer& buf) {
    VehicleSnapshot s;
    s.vehicle_id   = buf.read_u32();
    s.pos_x        = buf.read_float();
    s.pos_y        = buf.read_float();
    s.angle        = buf.read_float();
    s.speed        = buf.read_float();
    s.balance      = buf.read_float();
    s.driver_id    = buf.read_u32();
    s.passenger_id = buf.read_u32();
    return s;
}

} // namespace roadrage
