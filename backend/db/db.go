package db

import (
	"database/sql"
	"fmt"
	"os"

	_ "github.com/lib/pq" // Postgres driver — the underscore means "import for
	                       // side effects only". The driver registers itself with
	                       // database/sql when imported; we never call it directly.
)

// Connect reads DATABASE_URL from the environment and opens a connection pool.
// It also calls Ping() to verify the database is actually reachable before
// returning — so if your credentials are wrong you find out at startup,
// not on the first request.
func Connect() (*sql.DB, error) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		return nil, fmt.Errorf("DATABASE_URL environment variable is not set")
	}

	db, err := sql.Open("postgres", url)
	if err != nil {
		return nil, fmt.Errorf("opening db: %w", err)
	}

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("pinging db: %w", err)
	}

	// These three settings control the connection pool.
	// MaxOpenConns: never open more than 25 connections at once.
	// MaxIdleConns: keep up to 5 connections open even when idle,
	//               so the next request doesn't wait to establish one.
	// You rarely need to tune these until you have real traffic.
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)

	return db, nil
}