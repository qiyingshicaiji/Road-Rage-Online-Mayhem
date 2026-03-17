#include "data/database.h"
#include <iostream>
#include <cstring>

namespace roadrage {

Database::Database() {}

Database::~Database() {
    close();
}

bool Database::open(const std::string& path) {
    int rc = sqlite3_open(path.c_str(), &db_);
    if (rc != SQLITE_OK) {
        std::cerr << "[Database] Failed to open: " << sqlite3_errmsg(db_) << "\n";
        return false;
    }
    std::cout << "[Database] Opened: " << path << "\n";
    init_tables();
    return true;
}

void Database::close() {
    if (db_) {
        sqlite3_close(db_);
        db_ = nullptr;
    }
}

void Database::init_tables() {
    const char* sql = R"(
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            nickname TEXT DEFAULT '',
            total_games INTEGER DEFAULT 0,
            wins INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS match_records (
            record_id INTEGER PRIMARY KEY AUTOINCREMENT,
            match_id INTEGER NOT NULL,
            player_id INTEGER NOT NULL,
            ranking INTEGER DEFAULT 0,
            kills INTEGER DEFAULT 0,
            duration_seconds REAL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (player_id) REFERENCES users(user_id)
        );

        CREATE INDEX IF NOT EXISTS idx_match_player ON match_records(player_id);
        CREATE INDEX IF NOT EXISTS idx_match_id ON match_records(match_id);
    )";

    char* err = nullptr;
    int rc = sqlite3_exec(db_, sql, nullptr, nullptr, &err);
    if (rc != SQLITE_OK) {
        std::cerr << "[Database] Init error: " << err << "\n";
        sqlite3_free(err);
    } else {
        std::cout << "[Database] Tables initialized\n";
    }
}

bool Database::create_user(const std::string& username, const std::string& password) {
    const char* sql = "INSERT INTO users (username, password, nickname) VALUES (?, ?, ?)";
    sqlite3_stmt* stmt;
    int rc = sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr);
    if (rc != SQLITE_OK) return false;

    sqlite3_bind_text(stmt, 1, username.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 2, password.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 3, username.c_str(), -1, SQLITE_TRANSIENT);

    rc = sqlite3_step(stmt);
    sqlite3_finalize(stmt);
    return rc == SQLITE_DONE;
}

bool Database::authenticate(const std::string& username, const std::string& password, uint32_t& out_user_id) {
    const char* sql = "SELECT user_id FROM users WHERE username = ? AND password = ?";
    sqlite3_stmt* stmt;
    int rc = sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr);
    if (rc != SQLITE_OK) return false;

    sqlite3_bind_text(stmt, 1, username.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 2, password.c_str(), -1, SQLITE_TRANSIENT);

    bool found = false;
    if (sqlite3_step(stmt) == SQLITE_ROW) {
        out_user_id = static_cast<uint32_t>(sqlite3_column_int(stmt, 0));
        found = true;
    }
    sqlite3_finalize(stmt);
    return found;
}

UserRecord Database::get_user(uint32_t user_id) {
    UserRecord rec = {};
    const char* sql = "SELECT user_id, username, nickname, total_games, wins FROM users WHERE user_id = ?";
    sqlite3_stmt* stmt;
    int rc = sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr);
    if (rc != SQLITE_OK) return rec;

    sqlite3_bind_int(stmt, 1, static_cast<int>(user_id));

    if (sqlite3_step(stmt) == SQLITE_ROW) {
        rec.user_id = static_cast<uint32_t>(sqlite3_column_int(stmt, 0));
        rec.username = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 1));
        rec.nickname = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 2));
        rec.total_games = sqlite3_column_int(stmt, 3);
        rec.wins = sqlite3_column_int(stmt, 4);
    }
    sqlite3_finalize(stmt);
    return rec;
}

void Database::update_user_stats(uint32_t user_id, bool won) {
    const char* sql = won
        ? "UPDATE users SET total_games = total_games + 1, wins = wins + 1 WHERE user_id = ?"
        : "UPDATE users SET total_games = total_games + 1 WHERE user_id = ?";
    sqlite3_stmt* stmt;
    int rc = sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr);
    if (rc != SQLITE_OK) return;
    sqlite3_bind_int(stmt, 1, static_cast<int>(user_id));
    sqlite3_step(stmt);
    sqlite3_finalize(stmt);
}

uint32_t Database::create_match() {
    // Use a dedicated sequence: find the max match_id and increment
    const char* sql = "SELECT COALESCE(MAX(match_id), 0) + 1 FROM match_records";
    sqlite3_stmt* stmt;
    sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr);
    uint32_t id = 1;
    if (sqlite3_step(stmt) == SQLITE_ROW) {
        id = static_cast<uint32_t>(sqlite3_column_int(stmt, 0));
    }
    sqlite3_finalize(stmt);
    return id;
}

void Database::record_match_result(uint32_t match_id, uint32_t player_id,
                                    int ranking, int kills, double duration) {
    const char* sql = "INSERT INTO match_records (match_id, player_id, ranking, kills, duration_seconds) "
                      "VALUES (?, ?, ?, ?, ?)";
    sqlite3_stmt* stmt;
    int rc = sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr);
    if (rc != SQLITE_OK) return;

    sqlite3_bind_int(stmt, 1, static_cast<int>(match_id));
    sqlite3_bind_int(stmt, 2, static_cast<int>(player_id));
    sqlite3_bind_int(stmt, 3, ranking);
    sqlite3_bind_int(stmt, 4, kills);
    sqlite3_bind_double(stmt, 5, duration);
    sqlite3_step(stmt);
    sqlite3_finalize(stmt);
}

std::vector<MatchRecord> Database::get_player_matches(uint32_t player_id, int limit) {
    std::vector<MatchRecord> records;
    const char* sql = "SELECT match_id, player_id, ranking, kills, duration_seconds "
                      "FROM match_records WHERE player_id = ? ORDER BY created_at DESC LIMIT ?";
    sqlite3_stmt* stmt;
    int rc = sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr);
    if (rc != SQLITE_OK) return records;

    sqlite3_bind_int(stmt, 1, static_cast<int>(player_id));
    sqlite3_bind_int(stmt, 2, limit);

    while (sqlite3_step(stmt) == SQLITE_ROW) {
        MatchRecord r;
        r.match_id = static_cast<uint32_t>(sqlite3_column_int(stmt, 0));
        r.player_id = static_cast<uint32_t>(sqlite3_column_int(stmt, 1));
        r.ranking = sqlite3_column_int(stmt, 2);
        r.kills = sqlite3_column_int(stmt, 3);
        r.duration_seconds = sqlite3_column_double(stmt, 4);
        records.push_back(r);
    }
    sqlite3_finalize(stmt);
    return records;
}

} // namespace roadrage
