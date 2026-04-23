import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUrlOrSearch } from './url.ts';

test('https URL passes through', () => {
  assert.equal(normalizeUrlOrSearch('https://zeed.run'), 'https://zeed.run');
});

test('http URL passes through', () => {
  assert.equal(normalizeUrlOrSearch('http://example.com'), 'http://example.com');
});

test('domain without scheme gets https', () => {
  assert.equal(normalizeUrlOrSearch('google.com'), 'https://google.com');
});

test('domain with path gets https', () => {
  assert.equal(normalizeUrlOrSearch('github.com/foo'), 'https://github.com/foo');
});

test('bare word goes to Google search', () => {
  assert.equal(normalizeUrlOrSearch('qiita'), 'https://www.google.com/search?q=qiita');
});

test('multi-word query goes to Google search', () => {
  assert.equal(
    normalizeUrlOrSearch('how to deploy expo'),
    'https://www.google.com/search?q=how%20to%20deploy%20expo',
  );
});

test('Japanese query is URL-encoded', () => {
  assert.equal(
    normalizeUrlOrSearch('日本語'),
    'https://www.google.com/search?q=%E6%97%A5%E6%9C%AC%E8%AA%9E',
  );
});

test('empty input returns about:blank', () => {
  assert.equal(normalizeUrlOrSearch('   '), 'about:blank');
});

test('about:blank passes through', () => {
  assert.equal(normalizeUrlOrSearch('about:blank'), 'about:blank');
});

test('trims whitespace', () => {
  assert.equal(normalizeUrlOrSearch('  google.com  '), 'https://google.com');
});
