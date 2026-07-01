package main

import (
	"log"
	"net/http"
	"os"

	"github.com/joho/godotenv"
	"github.com/somunaexe/bulwriter/backend/internal/api"
	"github.com/somunaexe/bulwriter/backend/internal/hub"
	"github.com/somunaexe/bulwriter/backend/db"
)

func main() {
	// Load .env file. The underscore discards the error — if .env doesn't
	// exist (e.g. in production where env vars are set another way) that's fine.
	_ = godotenv.Load()

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