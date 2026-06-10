package cors

import "net/http"

type Options struct {
	AllowedOrigins []string
	AllowedMethods []string
	AllowedHeaders []string
}
type Cors struct{}

func New(o Options) *Cors  { return &Cors{} }
func (c *Cors) Handler(h http.Handler) http.Handler { return h }
