package main

import (
	"log"
	"net/http"

	"scriptflow/backend/internal/api"
	"scriptflow/backend/internal/hub"
)

func main() {
	syncHub := hub.NewHub()
	go syncHub.Run()

	router := api.NewRouter(syncHub)

	log.Println("ScriptFlow backend running on :8080")
	log.Fatal(http.ListenAndServe(":8080", router))
}
