-- Marks a budget line item as anchored to a highlighted span of script
-- text (see the budget_item ProseMirror mark, frontend/src/app/editor/
-- budget-mark.ts) rather than freeform. The anchor itself lives in the
-- script's Yjs document, not here — this column just tells the frontend
-- whether a "show in script" jump makes sense for a given row, without
-- it having to open the collab session and search the doc first.
ALTER TABLE budget_line_items ADD COLUMN IF NOT EXISTS linked BOOLEAN NOT NULL DEFAULT false;
