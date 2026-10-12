import test from 'node:test';
import assert from 'node:assert/strict';
import { checkNode } from './audit-schema-fields.mjs';
import { rate } from './check-crux.mjs';

const addr = { '@type': 'PostalAddress', addressLocality: 'Heber City', addressRegion: 'UT' };

test('top-level LocalBusiness needs name and address', () => {
  assert.deepEqual(checkNode({ '@type': 'RoofingContractor', name: 'Frame', telephone: '+1', url: 'https://x', address: addr }).errors, []);
  assert.deepEqual(checkNode({ '@type': 'RoofingContractor', name: 'Frame', telephone: '+1', url: 'https://x' }).errors, ['address']);
  assert.deepEqual(checkNode({ '@type': 'LocalBusiness', name: 'F', address: { '@type': 'PostalAddress' }, telephone: 1, url: 1 }).errors, ['address.addressLocality', 'address.addressRegion']);
});

test('nested provider and bare references are soft', () => {
  const r = checkNode({ '@type': 'RoofingContractor', name: 'Frame', telephone: '+1', url: 'https://x' }, 'provider');
  assert.deepEqual(r.errors, []);
  assert.equal(checkNode({ '@type': 'RoofingContractor', '@id': 'https://x/#org' }).kind, null);
});

test('Service needs name and provider (except inside OfferCatalog)', () => {
  assert.deepEqual(checkNode({ '@type': 'Service', name: 'Roof repair' }).errors, ['provider']);
  assert.deepEqual(checkNode({ '@type': 'Service', name: 'Roof repair' }, 'itemOffered').errors, []);
  assert.deepEqual(checkNode({ '@type': 'Service', provider: { '@id': 'x' } }).errors, ['name|serviceType']);
});

test('CrUX thresholds', () => {
  assert.equal(rate('largest_contentful_paint', 2400), 'good');
  assert.equal(rate('interaction_to_next_paint', 300), 'needs improvement');
  assert.equal(rate('cumulative_layout_shift', 0.3), 'poor');
});
