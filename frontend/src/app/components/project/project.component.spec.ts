import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';

import { ProjectComponent } from './project.component';
import { environment } from '../../../environments/environment';

describe('ProjectComponent', () => {
  let component: ProjectComponent;
  let fixture: ComponentFixture<ProjectComponent>;
  let httpMock: HttpTestingController;

  const projectId = 'proj-123';
  const projectUrl = `${environment.apiUrl}/projects/${projectId}`;
  const scriptsUrl = `${environment.apiUrl}/projects/${projectId}/scripts`;
  const roleUrl = `${environment.apiUrl}/projects/${projectId}/my-role`;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProjectComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { params: { projectId } } } },
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ProjectComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', () => {
    fixture.detectChanges(); // triggers ngOnInit, which fires the 3 requests below
    httpMock.expectOne(projectUrl).flush({ id: projectId, title: 'Test Project' });
    httpMock.expectOne(scriptsUrl).flush([]);
    httpMock.expectOne(roleUrl).flush({ role: 'owner' });

    expect(component).toBeTruthy();
  });

  it('shows "project not found" when the project fetch 404s, even if scripts/role succeed', () => {
    fixture.detectChanges();

    httpMock.expectOne(projectUrl).flush('not found', { status: 404, statusText: 'Not Found' });
    httpMock.expectOne(scriptsUrl).flush([]);
    httpMock.expectOne(roleUrl).flush({ role: 'owner' });

    expect(component.projectNotFound).toBeTrue();
    expect(component.loading).toBeFalse();
  });

  it('does not show "not found" and populates scripts when every request succeeds', () => {
    fixture.detectChanges();

    httpMock.expectOne(projectUrl).flush({ id: projectId, title: 'My Project' });
    httpMock.expectOne(scriptsUrl).flush([
      { id: 's1', title: 'Scene One', projectId, createdAt: '2026-01-01' },
    ]);
    httpMock.expectOne(roleUrl).flush({ role: 'editor' });

    expect(component.projectNotFound).toBeFalse();
    expect(component.loading).toBeFalse();
    expect(component.scripts.length).toBe(1);
    expect(component.canEdit).toBeTrue();
  });

  it('stays in the loading state until both the project and scripts requests have settled', () => {
    fixture.detectChanges();

    httpMock.expectOne(projectUrl).flush({ id: projectId, title: 'X' });
    // Scripts hasn't settled yet — must still be loading, or the page
    // would briefly flash "No scripts yet" before the scripts response
    // (or a not-found from it) actually lands.
    expect(component.loading).toBeTrue();

    httpMock.expectOne(scriptsUrl).flush([]);
    httpMock.expectOne(roleUrl).flush({ role: 'viewer' });

    expect(component.loading).toBeFalse();
  });

  it('does not gate loading on the role request settling', () => {
    fixture.detectChanges();

    httpMock.expectOne(projectUrl).flush({ id: projectId, title: 'X' });
    httpMock.expectOne(scriptsUrl).flush([]);
    // Role request deliberately left unflushed.

    expect(component.loading).toBeFalse();

    httpMock.expectOne(roleUrl).flush({ role: 'owner' });
  });
});
