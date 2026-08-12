import { scriptExportFilename } from './export-filename';

describe('scriptExportFilename', () => {
  it('uses the trimmed script title as the base filename', () => {
    expect(scriptExportFilename('  My Script  ', 'id-1')).toBe('My Script');
  });

  it('falls back to the script id when the title is blank', () => {
    expect(scriptExportFilename('   ', 'id-1')).toBe('id-1');
  });

  it('falls back to the script id when the title is null or undefined', () => {
    expect(scriptExportFilename(null, 'id-1')).toBe('id-1');
    expect(scriptExportFilename(undefined, 'id-1')).toBe('id-1');
  });

  it('strips characters that are illegal in filenames on common filesystems', () => {
    expect(scriptExportFilename('My/Script: Part*Two?', 'id-1')).toBe('My-Script- Part-Two-');
  });

  it('appends a suffix separated by a space when given one', () => {
    expect(scriptExportFilename('My Script', 'id-1', 'shoot schedule')).toBe('My Script shoot schedule');
  });

  it('omits the trailing space when no suffix is given', () => {
    expect(scriptExportFilename('My Script', 'id-1')).toBe('My Script');
  });
});
