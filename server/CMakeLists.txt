cmake_minimum_required(VERSION 3.16)
project(RoadRageServer VERSION 1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Find required packages
find_package(Boost REQUIRED COMPONENTS system)
find_package(Threads REQUIRED)

# Find SQLite3
find_package(PkgConfig)
pkg_check_modules(SQLITE3 REQUIRED sqlite3)

# Server executable
add_executable(road_rage_server
    src/main.cpp
    src/network/protocol.cpp
    src/network/session.cpp
    src/network/tcp_server.cpp
    src/game/vehicle.cpp
    src/game/combat.cpp
    src/game/game_room.cpp
    src/game/ai_controller.cpp
    src/data/database.cpp
)

target_include_directories(road_rage_server PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/src
    ${Boost_INCLUDE_DIRS}
    ${SQLITE3_INCLUDE_DIRS}
)

target_link_libraries(road_rage_server PRIVATE
    Boost::system
    Threads::Threads
    ${SQLITE3_LIBRARIES}
)

# Protocol test
add_executable(test_protocol
    tests/test_protocol.cpp
    src/network/protocol.cpp
)

target_include_directories(test_protocol PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/src
)

# Game logic test
add_executable(test_game
    tests/test_game.cpp
    src/game/vehicle.cpp
    src/game/combat.cpp
)

target_include_directories(test_game PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/src
)

enable_testing()
add_test(NAME ProtocolTest COMMAND test_protocol)
add_test(NAME GameTest COMMAND test_game)
