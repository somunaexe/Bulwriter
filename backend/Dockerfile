# Stage 1 — build the Go binary
# We use a full Go image to compile, then throw it away
FROM golang:1.22 AS builder

WORKDIR /app

# Copy dependency files first — Docker caches these layers separately.
# If only your source code changes, Docker skips re-downloading modules.
COPY go.mod go.sum ./
RUN go mod download

# Now copy the rest of the source and build
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o bulwriter ./backend/cmd/server

# Stage 2 — the actual container that runs
# We use a tiny image with no Go toolchain — just the compiled binary.
# This makes the final image ~15MB instead of ~1GB.
FROM alpine:latest

WORKDIR /app
COPY --from=builder /app/bulwriter .

EXPOSE 8080
CMD ["./bulwriter"]