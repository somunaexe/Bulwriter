import { colorForUserId, collabCursorBuilder } from './collab-cursor';

describe('colorForUserId', () => {
  it('is deterministic — the same id always gets the same color', () => {
    const id = 'user_2abcXYZ';
    expect(colorForUserId(id)).toBe(colorForUserId(id));
  });

  it('returns a valid 6-digit hex color', () => {
    expect(colorForUserId('some-user-id')).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('spreads different ids across the palette rather than collapsing to one color', () => {
    const ids = ['user_a', 'user_b', 'user_c', 'user_d', 'user_e', 'user_f', 'user_g', 'user_h'];
    const colors = new Set(ids.map(colorForUserId));
    expect(colors.size).toBeGreaterThan(1);
  });
});

describe('collabCursorBuilder', () => {
  it('renders the collaborator name inside a hoverable label, not bare inline text', () => {
    const cursor = collabCursorBuilder({ name: 'Alex Writer', color: '#ff0000' });

    expect(cursor.classList.contains('collab-cursor')).toBeTrue();
    const label = cursor.querySelector('.collab-cursor-label');
    expect(label).withContext('name must live inside a .collab-cursor-label, not directly in .collab-cursor').not.toBeNull();
    expect(label?.textContent).toBe('Alex Writer');
  });

  it('sets the collaborator color as a CSS custom property on the caret', () => {
    const cursor = collabCursorBuilder({ name: 'Alex', color: '#123abc' });
    expect(cursor.style.getPropertyValue('--collab-color')).toBe('#123abc');
  });
});
