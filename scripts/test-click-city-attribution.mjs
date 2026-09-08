import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../track-clicks.js', import.meta.url), 'utf8');

function cityFor(pathname) {
  const window = {
    location: { pathname, href: 'https://www.framerestorationutah.com' + pathname },
    setTimeout() {}, addEventListener() {},
  };
  const document = { title: 'Test', referrer: '', addEventListener() {} };
  vm.runInNewContext(source, { window, document });
  return window.FrameClicks._build({ getAttribute: () => 'tel:+14352928802' }, 'call').city;
}

test('SLC calls and texts retain city on production clean URLs and legacy forms', () => {
  for (const path of ['/locations/salt-lake-city', '/locations/salt-lake-city/', '/locations/salt-lake-city.html']) {
    assert.equal(cityFor(path), 'salt lake city', path);
  }
});

test('other supported routes remain compatible and unrelated paths stay unknown', () => {
  assert.equal(cityFor('/locations/millcreek'), 'millcreek');
  assert.equal(cityFor('/salt-lake-city'), 'salt lake city');
  assert.equal(cityFor('/blog/salt-lake-city/roof-repair'), 'salt lake city');
  for (const path of ['/', '/pages/about', '/locations/salt-lake-city-fake/other', '/other/locations/salt-lake-city.html']) {
    assert.equal(cityFor(path), null, path);
  }
});
