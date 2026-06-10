package websocket

import "net/http"

const BinaryMessage = 2

type Upgrader struct{ CheckOrigin func(*http.Request) bool }
type Conn struct{}

func (u *Upgrader) Upgrade(w http.ResponseWriter, r *http.Request, h http.Header) (*Conn, error) {
	return &Conn{}, nil
}
func (c *Conn) ReadMessage() (int, []byte, error)  { return 0, nil, nil }
func (c *Conn) WriteMessage(t int, d []byte) error { return nil }
func (c *Conn) Close() error                        { return nil }
