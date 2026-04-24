import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStartPageHtml, escapeHtml, NEW_TAB_URL } from './startpage.ts';

test('escapeHtml: ampersands, tags, quotes', () => {
  assert.equal(escapeHtml('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
});

test('NEW_TAB_URL is not a real https URL', () => {
  assert.ok(!/^https?:\/\//.test(NEW_TAB_URL));
});

test('buildStartPageHtml: renders brand + sub', () => {
  const html = buildStartPageHtml({ bookmarks: [], recent: [], profileName: 'Personal' });
  assert.match(html, /Zeed/);
  assert.match(html, /Personal profile/);
});

test('buildStartPageHtml: empty state when no data', () => {
  const html = buildStartPageHtml({ bookmarks: [], recent: [] });
  assert.match(html, /No bookmarks or history/);
});

test('buildStartPageHtml: escapes titles to prevent HTML injection', () => {
  const html = buildStartPageHtml({
    bookmarks: [{ url: 'https://example.com', title: '<script>alert(1)</script>' }],
    recent: [],
  });
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.match(html, /&lt;script&gt;/);
});

test('buildStartPageHtml: bookmarks use favicon host', () => {
  const html = buildStartPageHtml({
    bookmarks: [{ url: 'https://github.com/foo', title: 'Foo' }],
    recent: [],
  });
  assert.match(html, /domain=github\.com/);
});

test('buildStartPageHtml: caps bookmarks at 8 and recent at 6', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({
    url: `https://ex${i}.com`, title: `E${i}`,
  }));
  const html = buildStartPageHtml({ bookmarks: many, recent: many });
  const bookmarkCount = (html.match(/class="card"/g) ?? []).length;
  // 8 bookmarks + 6 recent = 14
  assert.equal(bookmarkCount, 14);
});
