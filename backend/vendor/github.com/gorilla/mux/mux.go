package mux

import "net/http"

type Router struct{ mux *http.ServeMux }
type Route struct{}

func NewRouter() *Router { return &Router{mux: http.NewServeMux()} }
func (r *Router) HandleFunc(path string, f func(http.ResponseWriter, *http.Request)) *Route {
	r.mux.HandleFunc(path, f)
	return &Route{}
}
func (r *Route) Methods(...string) *Route                            { return r }
func (r *Router) ServeHTTP(w http.ResponseWriter, req *http.Request) { r.mux.ServeHTTP(w, req) }
func Vars(r *http.Request) map[string]string                         { return map[string]string{} }
