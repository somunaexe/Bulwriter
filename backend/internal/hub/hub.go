// hub.go — real-time sync hub
// Each script gets its own Room. Writers connect via WebSocket and
// receive every Yjs binary update that other clients in the room produce.
// The hub also keeps an in-memory append-only update log per room so
// that a late-joining client can replay all prior operations and reach
// the same CRDT state as everyone else.
package hub

import (
	"log"
	"net/http"
	"sync"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true }, // tighten in production
}

// Client represents a single connected writer.
type Client struct {
	ID     string
	RoomID string
	conn   *websocket.Conn
	send   chan []byte
	hub    *Hub
}

// Room holds all clients editing the same script and the update log
// so new joiners can catch up.
type Room struct {
	mu      sync.RWMutex
	clients map[string]*Client
	updates [][]byte // append-only Yjs update log
}

func newRoom() *Room {
	return &Room{clients: make(map[string]*Client)}
}

// Hub owns all rooms.
type Hub struct {
	mu    sync.RWMutex
	rooms map[string]*Room

	// Channel-based messages from clients
	broadcast  chan message
	register   chan *Client
	unregister chan *Client
}

type message struct {
	roomID string
	sender string
	data   []byte
}

func NewHub() *Hub {
	return &Hub{
		rooms:      make(map[string]*Room),
		broadcast:  make(chan message, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

// Run processes hub events — must be called in its own goroutine.
func (h *Hub) Run() {
	for {
		select {
		case c := <-h.register:
			h.mu.Lock()
			room, ok := h.rooms[c.RoomID]
			if !ok {
				room = newRoom()
				h.rooms[c.RoomID] = room
			}
			room.clients[c.ID] = c
			h.mu.Unlock()

			// Send the full update log so the joiner reaches current state.
			room.mu.RLock()
			for _, upd := range room.updates {
				c.send <- upd
			}
			room.mu.RUnlock()

			log.Printf("client %s joined room %s (%d clients)", c.ID, c.RoomID, len(room.clients))

		case c := <-h.unregister:
			h.mu.Lock()
			if room, ok := h.rooms[c.RoomID]; ok {
				delete(room.clients, c.ID)
				if len(room.clients) == 0 {
					delete(h.rooms, c.RoomID)
				}
			}
			h.mu.Unlock()
			close(c.send)
			log.Printf("client %s left room %s", c.ID, c.RoomID)

		case msg := <-h.broadcast:
			h.mu.RLock()
			room, ok := h.rooms[msg.roomID]
			h.mu.RUnlock()
			if !ok {
				continue
			}

			// Persist update to in-memory log.
			room.mu.Lock()
			room.updates = append(room.updates, msg.data)
			room.mu.Unlock()

			// Fan out to every other client in the room.
			room.mu.RLock()
			for id, c := range room.clients {
				if id == msg.sender {
					continue
				}
				select {
				case c.send <- msg.data:
				default:
					// Slow client — drop rather than block the hub.
					log.Printf("dropping update for slow client %s", id)
				}
			}
			room.mu.RUnlock()
		}
	}
}

// ServeWS upgrades an HTTP connection to WebSocket and registers the client.
// URL param: scriptId (used as room ID)
func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request, roomID string) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("ws upgrade error:", err)
		return
	}

	client := &Client{
		ID:     uuid.New().String(),
		RoomID: roomID,
		conn:   conn,
		send:   make(chan []byte, 128),
		hub:    h,
	}

	h.register <- client

	go client.writePump()
	go client.readPump()
}

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			break
		}
		c.hub.broadcast <- message{roomID: c.RoomID, sender: c.ID, data: data}
	}
}

func (c *Client) writePump() {
	defer c.conn.Close()
	for data := range c.send {
		if err := c.conn.WriteMessage(websocket.BinaryMessage, data); err != nil {
			break
		}
	}
}
