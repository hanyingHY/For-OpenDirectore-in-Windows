import test from 'node:test';
import assert from 'node:assert/strict';
import { messages, localeFor, format } from '../src/locale.mjs';

test('both locales expose the same keys', () => {
  const en = Object.keys(messages['en-US']).sort();
  const zh = Object.keys(messages['zh-CN']).sort();
  assert.deepEqual(en, zh);
});

test('no message is empty and Chinese strings are localized', () => {
  // Brand/product names and icon glyphs legitimately stay Latin in both locales.
  const brandKeys = new Set(['app']);
  for (const [locale, table] of Object.entries(messages)) {
    for (const [key, value] of Object.entries(table)) {
      assert.equal(typeof value, 'string', `${locale}.${key}`);
      assert.equal(value.trim().length > 0, true, `${locale}.${key} is empty`);
      if (locale === 'zh-CN' && !brandKeys.has(key)) {
        assert.match(value, /[\u4e00-\u9fff]/, `${locale}.${key} should contain Chinese`);
      }
    }
  }
});

test('localeFor maps system locales', () => {
  assert.equal(localeFor('zh-CN'), 'zh-CN');
  assert.equal(localeFor('zh-TW'), 'zh-CN');
  assert.equal(localeFor('en-US'), 'en-US');
  assert.equal(localeFor('fr-FR'), 'en-US');
  assert.equal(localeFor(undefined), 'en-US');
});

test('format substitutes placeholders and leaves unknowns intact', () => {
  assert.equal(format('OpenDirector {version} (you have {current})', { version: '0.3.0', current: '0.2.0' }),
    'OpenDirector 0.3.0 (you have 0.2.0)');
  assert.equal(format('{missing} stays', {}), '{missing} stays');
});
