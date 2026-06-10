package uuid

import (
	"crypto/rand"
	"fmt"
)

type UUID [16]byte

func New() UUID {
	var u UUID
	rand.Read(u[:])
	u[6] = (u[6] & 0x0f) | 0x40
	u[8] = (u[8] & 0x3f) | 0x80
	return u
}
func (u UUID) String() string {
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", u[0:4], u[4:6], u[6:8], u[8:10], u[10:])
}
