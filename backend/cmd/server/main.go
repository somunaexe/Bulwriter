package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"github.com/getsentry/sentry-go"
	"github.com/joho/godotenv"
	"github.com/somunaexe/bulwriter/backend/db"
	"github.com/somunaexe/bulwriter/backend/internal/api"
	"github.com/somunaexe/bulwriter/backend/internal/hub"
	"github.com/somunaexe/bulwriter/backend/internal/trash"
)

func main() {
	// Load .env file. The underscore discards the error — if .env doesn't
	// exist (e.g. in production where env vars are set another way) that's fine.
	_ = godotenv.Load()

	// Error tracking — opt-in via SENTRY_DSN, same pattern as every other
	// third-party credential in this app (Clerk, Anthropic, Stripe): unset
	// just means it's off, not broken. Without this, a production panic or
	// internal error is only visible if a user happens to report it.
	if dsn := os.Getenv("SENTRY_DSN"); dsn != "" {
		if err := sentry.Init(sentry.ClientOptions{
			Dsn:              dsn,
			AttachStacktrace: true,
		}); err != nil {
			log.Printf("sentry init failed: %v", err)
		} else {
			defer sentry.Flush(2 * time.Second)
			log.Println("error tracking enabled (Sentry)")
		}
	}

	// Connect to Postgres. This is the one place in the whole app that
	// knows about the database connection. Everything else receives it
	// as a parameter — this keeps the rest of the code testable.
	database, err := db.Connect()
	if err != nil {
		log.Fatalf("could not connect to database: %v", err)
	}
	defer database.Close()

	if err := db.Migrate(database); err != nil {
		log.Fatalf("could not run migrations: %v", err)
	}
	log.Println("connected to database")

	syncHub := hub.NewHub()
	go syncHub.Run()

	// Permanently discards trashed projects/scripts past their 30-day
	// retention window — runs once immediately, then hourly.
	go trash.RunPeriodicPurge(trash.NewStore(database), time.Hour)

	// Pass the database down into the router so handlers can use it
	router := api.NewRouter(syncHub, database)

	// Railway sets PORT — fall back to 8080 for local dev
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Bulwriter backend running on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, router))
}
