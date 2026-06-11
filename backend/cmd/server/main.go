package main

import (
	"log"
	"net/http"

	"github.com/somunaexe/bulwriter/backend/internal/api"
	"github.com/somunaexe/bulwriter/backend/internal/hub"
)

func main() {
	syncHub := hub.NewHub()
	go syncHub.Run()

	router := api.NewRouter(syncHub)

	log.Println("Bulwriter backend running on :8080")
	log.Fatal(http.ListenAndServe(":8080", router))
}
