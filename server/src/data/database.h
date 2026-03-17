#pragma once

#include <sqlite3.h>
#include <string>
#include <memory>
#include <vector>

namespace roadrage {

struct UserRecord {
    uint32_t user_id;
    std::string username;
    std::string nickname;
    int total_games;
    int wins;
};

struct MatchRecord {
    uint32_t match_id;
    uint32_t player_id;
    int ranking;
    int kills;
    double duration_seconds;
};

class Database {
public:
    Database();
    ~Database();

    bool open(const std::string& path);
    void close();

    // User operations
    bool create_user(const std::string& username, const std::string& password);
    bool authenticate(const std::string& username, const std::string& password, uint32_t& out_user_id);
    UserRecord get_user(uint32_t user_id);
    void update_user_stats(uint32_t user_id, bool won);

    // Match operations
    uint32_t create_match();
    void record_match_result(uint32_t match_id, uint32_t player_id, int ranking, int kills, double duration);
    std::vector<MatchRecord> get_player_matches(uint32_t player_id, int limit = 10);

private:
    void init_tables();
    sqlite3* db_ = nullptr;
};

} // namespace roadrage
