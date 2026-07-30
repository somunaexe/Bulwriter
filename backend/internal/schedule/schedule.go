package schedule

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// Strip is one scene's slot in the shooting schedule — keyed by scene
// heading text (scene_key), same convention as breakdown.SceneBreakdown.
type Strip struct {
	ID        string    `json:"id"`
	ScriptID  string    `json:"scriptId"`
	SceneKey  string    `json:"sceneKey"`
	DayNumber int       `json:"dayNumber"`
	Position  int       `json:"position"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// StripInput is what the client sends to replace the schedule — no ID,
// since the whole thing is rewritten rather than patched field-by-field.
type StripInput struct {
	SceneKey  string `json:"sceneKey"`
	DayNumber int    `json:"dayNumber"`
	Position  int    `json:"position"`
}

// DayMeta is a shoot day's call-sheet fields — date, general crew call
// time, location, and freeform notes. Keyed by day_number, same as
// Strip, and always rewritten together with strips (see Replace) so the
// two stay aligned when days are added/removed/renumbered.
type DayMeta struct {
	ScriptID        string    `json:"scriptId"`
	DayNumber       int       `json:"dayNumber"`
	ShootDate       string    `json:"shootDate"`
	CallTime        string    `json:"callTime"`
	Location        string    `json:"location"`
	Notes           string    `json:"notes"`
	DataBackedUp    bool      `json:"dataBackedUp"`
	DailiesReviewed bool      `json:"dailiesReviewed"`
	CameraReport    string    `json:"cameraReport"`
	SoundReport     string    `json:"soundReport"`
	WrapNotes       string    `json:"wrapNotes"`
	UpdatedAt       time.Time `json:"updatedAt"`
}

type DayMetaInput struct {
	DayNumber       int    `json:"dayNumber"`
	ShootDate       string `json:"shootDate"`
	CallTime        string `json:"callTime"`
	Location        string `json:"location"`
	Notes           string `json:"notes"`
	DataBackedUp    bool   `json:"dataBackedUp"`
	DailiesReviewed bool   `json:"dailiesReviewed"`
	CameraReport    string `json:"cameraReport"`
	SoundReport     string `json:"soundReport"`
	WrapNotes       string `json:"wrapNotes"`
}

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

func (s *Store) List(scriptID string) ([]*Strip, error) {
	rows, err := s.db.Query(
		`SELECT id, script_id, scene_key, day_number, position, updated_at
		 FROM schedule_strips WHERE script_id = $1
		 ORDER BY day_number ASC, position ASC`, scriptID,
	)
	if err != nil {
		return nil, fmt.Errorf("querying schedule: %w", err)
	}
	defer rows.Close()

	var out []*Strip
	for rows.Next() {
		st := &Strip{}
		if err := rows.Scan(&st.ID, &st.ScriptID, &st.SceneKey, &st.DayNumber, &st.Position, &st.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scanning strip: %w", err)
		}
		out = append(out, st)
	}
	return out, rows.Err()
}

func (s *Store) ListDays(scriptID string) ([]*DayMeta, error) {
	rows, err := s.db.Query(
		`SELECT script_id, day_number, shoot_date, call_time, location, notes,
		        data_backed_up, dailies_reviewed, camera_report, sound_report, wrap_notes, updated_at
		 FROM schedule_days WHERE script_id = $1
		 ORDER BY day_number ASC`, scriptID,
	)
	if err != nil {
		return nil, fmt.Errorf("querying schedule days: %w", err)
	}
	defer rows.Close()

	var out []*DayMeta
	for rows.Next() {
		d := &DayMeta{}
		if err := rows.Scan(
			&d.ScriptID, &d.DayNumber, &d.ShootDate, &d.CallTime, &d.Location, &d.Notes,
			&d.DataBackedUp, &d.DailiesReviewed, &d.CameraReport, &d.SoundReport, &d.WrapNotes, &d.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scanning schedule day: %w", err)
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// Replace wipes and rewrites the whole schedule (strips AND day
// metadata) for a script in one transaction — a drag-and-drop reorder
// touches many strips' day/position at once, and can renumber days, so
// replacing both full sets together is simpler and more robust than
// diffing against what's currently stored, and keeps day_number aligned
// between the two tables.
func (s *Store) Replace(scriptID string, strips []StripInput, days []DayMetaInput) ([]*Strip, []*DayMeta, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return nil, nil, fmt.Errorf("starting transaction: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`DELETE FROM schedule_strips WHERE script_id = $1`, scriptID); err != nil {
		return nil, nil, fmt.Errorf("clearing schedule: %w", err)
	}
	if _, err := tx.Exec(`DELETE FROM schedule_days WHERE script_id = $1`, scriptID); err != nil {
		return nil, nil, fmt.Errorf("clearing schedule days: %w", err)
	}

	now := time.Now()

	outStrips := make([]*Strip, 0, len(strips))
	for _, in := range strips {
		st := &Strip{
			ID:        uuid.New().String(),
			ScriptID:  scriptID,
			SceneKey:  in.SceneKey,
			DayNumber: in.DayNumber,
			Position:  in.Position,
			UpdatedAt: now,
		}
		if _, err := tx.Exec(
			`INSERT INTO schedule_strips (id, script_id, scene_key, day_number, position, updated_at)
			 VALUES ($1, $2, $3, $4, $5, $6)`,
			st.ID, st.ScriptID, st.SceneKey, st.DayNumber, st.Position, st.UpdatedAt,
		); err != nil {
			return nil, nil, fmt.Errorf("inserting strip: %w", err)
		}
		outStrips = append(outStrips, st)
	}

	outDays := make([]*DayMeta, 0, len(days))
	for _, in := range days {
		d := &DayMeta{
			ScriptID:        scriptID,
			DayNumber:       in.DayNumber,
			ShootDate:       in.ShootDate,
			CallTime:        in.CallTime,
			Location:        in.Location,
			Notes:           in.Notes,
			DataBackedUp:    in.DataBackedUp,
			DailiesReviewed: in.DailiesReviewed,
			CameraReport:    in.CameraReport,
			SoundReport:     in.SoundReport,
			WrapNotes:       in.WrapNotes,
			UpdatedAt:       now,
		}
		if _, err := tx.Exec(
			`INSERT INTO schedule_days (
			   script_id, day_number, shoot_date, call_time, location, notes,
			   data_backed_up, dailies_reviewed, camera_report, sound_report, wrap_notes, updated_at
			 )
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
			d.ScriptID, d.DayNumber, d.ShootDate, d.CallTime, d.Location, d.Notes,
			d.DataBackedUp, d.DailiesReviewed, d.CameraReport, d.SoundReport, d.WrapNotes, d.UpdatedAt,
		); err != nil {
			return nil, nil, fmt.Errorf("inserting schedule day: %w", err)
		}
		outDays = append(outDays, d)
	}

	if err := tx.Commit(); err != nil {
		return nil, nil, fmt.Errorf("committing schedule: %w", err)
	}
	return outStrips, outDays, nil
}
