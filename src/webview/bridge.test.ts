import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClickByLabelJs,
  buildClickBySelectorJs,
  buildReadPageJs,
  escapeJs,
} from './bridge.ts';

test('escapeJs: basic string', () => {
  assert.equal(escapeJs('hello'), '"hello"');
});

test('escapeJs: quotes and newlines', () => {
  assert.equal(escapeJs('a"b\nc'), '"a\\"b\\nc"');
});

test('escapeJs: null/undefined coerced to empty', () => {
  assert.equal(escapeJs(null as unknown as string), '""');
  assert.equal(escapeJs(undefined as unknown as string), '""');
});

test('buildClickByLabelJs: embeds label safely', () => {
  const js = buildClickByLabelJs('Activate domain', 'button');
  assert.match(js, /"Activate domain"/);
  assert.match(js, /"button"/);
  assert.match(js, /\(function\(\)\{/);
});

test('buildClickByLabelJs: label with quotes does not break JS', () => {
  const js = buildClickByLabelJs('Click "me"');
  assert.match(js, /"Click \\"me\\""/);
});

test('buildClickByLabelJs: default role is empty string', () => {
  const js = buildClickByLabelJs('Submit');
  assert.match(js, /wantRole = ""/);
});

test('buildClickBySelectorJs: embeds selector', () => {
  const js = buildClickBySelectorJs('button[data-testid="activate"]');
  assert.match(js, /"button\[data-testid=\\"activate\\"\]"/);
});

test('buildReadPageJs: interactiveOnly toggles flag', () => {
  assert.match(buildReadPageJs(true), /interactiveOnly=true/);
  assert.match(buildReadPageJs(false), /interactiveOnly=false/);
  assert.match(buildReadPageJs(), /interactiveOnly=false/);
});

test('buildReadPageJs: tags all interactive with data-zeed-ref', () => {
  const js = buildReadPageJs();
  assert.match(js, /setAttribute\('data-zeed-ref'/);
});

test('buildClickByLabelJs: produces parseable JS', () => {
  const js = buildClickByLabelJs('hello', 'button');
  assert.doesNotThrow(() => new Function(`return ${js};`));
});

test('buildReadPageJs: produces parseable JS', () => {
  const js = buildReadPageJs();
  assert.doesNotThrow(() => new Function(`return ${js};`));
});

test('buildReadPageJs: posts back via ReactNativeWebView.postMessage', () => {
  const js = buildReadPageJs();
  assert.match(js, /window\.ReactNativeWebView\.postMessage/);
  assert.match(js, /type:'read_page'/);
});
