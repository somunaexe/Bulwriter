package db

import (
	"database/sql"
	"embed"
	"fmt"
	"io/fs"
	"log"
	"sort"
	"strings"
)

// //go:embed migrations/*.sql tells the Go compiler to bundle every .sql
// file in the migrations folder into the binary at compile time.
// The double slash is intentional — it's a special compiler directive.
//
//go:embed migrations/*.sql
var migrationsFS embed.FS

// Migrate reads all .sql files from the embedded migrations folder
// and executes them in alphabetical order (001, 002, 003...).
// Because every statement uses IF NOT EXISTS, re-running is always safe.
func Migrate(db *sql.DB) error {
	// Read the list of embedded migration files
	entries, err := fs.ReadDir(migrationsFS, "migrations")
	if err != nil {
		return fmt.Errorf("reading migrations dir: %w", err)
	}

	// Sort by filename so 001 runs before 002 before 003
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].Name() < entries[j].Name()
	})

	for _, entry := range entries {
		// Skip anything that isn't a .sql file
		if !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}

		// Read the file content from the embedded filesystem
		content, err := migrationsFS.ReadFile("migrations/" + entry.Name())
		if err != nil {
			return fmt.Errorf("reading migration %s: %w", entry.Name(), err)
		}

		// Execute the SQL
		if _, err := db.Exec(string(content)); err != nil {
			return fmt.Errorf("running migration %s: %w", entry.Name(), err)
		}

		log.Printf("migration applied: %s", entry.Name())
	}

	return nil
}