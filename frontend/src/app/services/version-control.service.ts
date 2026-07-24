import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Branch {
  id: string;
  projectId: string;
  name: string;
  tipId: string;
  createdAt: string;
  // Auto-save's own slot, separate from the snapshot history — see
  // backend/db/migrations/006_branch_draft.sql. draftUpdatedAt is unset
  // when there's no draft newer than the tip snapshot.
  draftContent?: string;
  draftUpdatedAt?: string;
}

export interface Snapshot {
  id: string;
  projectId: string;
  branchId: string;
  hash: string;
  content: string;
  message: string;
  authorId: string;
  parentId: string;
  createdAt: string;
}

export interface DiffLine {
  op: 'equal' | 'insert' | 'delete';
  text: string;
}

@Injectable({ providedIn: 'root' })
export class VersionControlService {
  private BASE = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // ── Branches ──────────────────────────────────────────────────────

  listBranches(projectId: string, scriptId: string): Observable<Branch[]> {
    return this.http.get<Branch[]>(`${this.BASE}/projects/${projectId}/scripts/${scriptId}/branches`);
  }

  createBranch(projectId: string, scriptId: string, name: string, fromSnapshotId = ''): Observable<Branch> {
    return this.http.post<Branch>(`${this.BASE}/projects/${projectId}/scripts/${scriptId}/branches`, {
      name,
      fromSnapshotId,
    });
  }

  // ── Snapshots ─────────────────────────────────────────────────────

  /** Save a named snapshot (commit) on a branch. */
  commit(projectId: string, scriptId: string, branchId: string, content: string, message: string): Observable<Snapshot> {
    return this.http.post<Snapshot>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/branches/${branchId}/commit`,
      { content, message, authorId: 'current-user' } // swap authorId for real auth later
    );
  }

  /** Overwrites the branch's draft slot — what auto-save calls instead of
   *  commit(), so autosaving never adds an entry to the snapshot history. */
  saveDraft(projectId: string, scriptId: string, branchId: string, content: string): Observable<void> {
    return this.http.put<void>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/branches/${branchId}/draft`,
      { content }
    );
  }

  /** Fetch the linear history of a branch back to its root. */
  history(projectId: string, scriptId: string, branchId: string): Observable<Snapshot[]> {
    return this.http.get<Snapshot[]>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/branches/${branchId}/history`
    );
  }

  getSnapshot(projectId: string, scriptId: string, branchId: string, snapshotId: string): Observable<Snapshot> {
    return this.http.get<Snapshot>(`${this.BASE}/projects/${projectId}/scripts/${scriptId}/branches/${branchId}/snapshots/${snapshotId}`);
  }

  // ── Diff ──────────────────────────────────────────────────────────
  
  diff(fromId: string, toId: string): Observable<DiffLine[]> {
    return this.http.get<DiffLine[]>(`${this.BASE}/diff?from=${fromId}&to=${toId}`);
  }
}
