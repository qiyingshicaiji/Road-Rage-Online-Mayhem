/**
 * Protocol serialization/deserialization tests
 */
#include "network/protocol.h"
#include <cassert>
#include <iostream>
#include <cmath>

using namespace roadrage;

void test_byte_buffer() {
    std::cout << "  test_byte_buffer...";
    ByteBuffer buf;

    buf.write_u8(42);
    buf.write_u16(1234);
    buf.write_u32(567890);
    buf.write_float(3.14f);
    buf.write_string("hello");

    ByteBuffer reader(buf.data());
    assert(reader.read_u8() == 42);
    assert(reader.read_u16() == 1234);
    assert(reader.read_u32() == 567890);
    assert(std::abs(reader.read_float() - 3.14f) < 0.001f);
    assert(reader.read_string() == "hello");
    assert(reader.remaining() == 0);

    std::cout << " OK\n";
}

void test_message_serialize() {
    std::cout << "  test_message_serialize...";

    Message msg;
    msg.msg_id = MsgType::MSG_LOGIN;
    msg.sequence = 42;
    ByteBuffer payload;
    payload.write_string("testuser");
    payload.write_string("testpass");
    msg.payload = std::move(payload);

    auto data = msg.serialize();
    assert(data.size() == HEADER_SIZE + msg.payload.size());

    // Parse it back
    Message parsed;
    size_t consumed = Message::try_parse(data.data(), data.size(), parsed);
    assert(consumed == data.size());
    assert(parsed.msg_id == MsgType::MSG_LOGIN);
    assert(parsed.sequence == 42);

    ByteBuffer parsed_payload(parsed.payload.data());
    assert(parsed_payload.read_string() == "testuser");
    assert(parsed_payload.read_string() == "testpass");

    std::cout << " OK\n";
}

void test_message_incomplete() {
    std::cout << "  test_message_incomplete...";

    Message msg;
    msg.msg_id = MsgType::MSG_PING;
    msg.sequence = 1;
    auto data = msg.serialize();

    // Only send partial header
    Message parsed;
    size_t consumed = Message::try_parse(data.data(), 3, parsed);
    assert(consumed == 0);  // Incomplete

    // Send full message
    consumed = Message::try_parse(data.data(), data.size(), parsed);
    assert(consumed == data.size());
    assert(parsed.msg_id == MsgType::MSG_PING);

    std::cout << " OK\n";
}

void test_input_frame() {
    std::cout << "  test_input_frame...";

    InputFrame input;
    input.throttle = 200;
    input.steering = -50;
    input.brake = true;
    input.attack = AttackType::KICK;
    input.target_id = 12345;

    ByteBuffer buf;
    input.serialize(buf);

    ByteBuffer reader(buf.data());
    InputFrame parsed = InputFrame::deserialize(reader);

    assert(parsed.throttle == 200);
    assert(parsed.steering == -50);
    assert(parsed.brake == true);
    assert(parsed.attack == AttackType::KICK);
    assert(parsed.target_id == 12345);

    std::cout << " OK\n";
}

void test_vehicle_snapshot() {
    std::cout << "  test_vehicle_snapshot...";

    VehicleSnapshot snap;
    snap.vehicle_id = 1;
    snap.pos_x = 100.5f;
    snap.pos_y = -3.2f;
    snap.angle = 0.785f;
    snap.speed = 15.0f;
    snap.balance = 75.0f;
    snap.driver_id = 101;
    snap.passenger_id = 102;

    ByteBuffer buf;
    snap.serialize(buf);

    ByteBuffer reader(buf.data());
    VehicleSnapshot parsed = VehicleSnapshot::deserialize(reader);

    assert(parsed.vehicle_id == 1);
    assert(std::abs(parsed.pos_x - 100.5f) < 0.01f);
    assert(std::abs(parsed.pos_y - (-3.2f)) < 0.01f);
    assert(std::abs(parsed.angle - 0.785f) < 0.001f);
    assert(std::abs(parsed.speed - 15.0f) < 0.01f);
    assert(std::abs(parsed.balance - 75.0f) < 0.01f);
    assert(parsed.driver_id == 101);
    assert(parsed.passenger_id == 102);

    std::cout << " OK\n";
}

void test_signed_values() {
    std::cout << "  test_signed_values...";

    ByteBuffer buf;
    buf.write_i16(-1000);
    buf.write_i16(32000);
    buf.write_i16(0);

    ByteBuffer reader(buf.data());
    assert(reader.read_i16() == -1000);
    assert(reader.read_i16() == 32000);
    assert(reader.read_i16() == 0);

    std::cout << " OK\n";
}

int main() {
    std::cout << "=== Protocol Tests ===\n";

    test_byte_buffer();
    test_message_serialize();
    test_message_incomplete();
    test_input_frame();
    test_vehicle_snapshot();
    test_signed_values();

    std::cout << "All protocol tests passed!\n";
    return 0;
}
