import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const pii = /\b(?:name|email|phone|address|from_number|to_number|forwarded_to|caller_name|recording_url|call_sid|notes|message|contract_url|warranty_doc_url|gclid|fbclid|msclkid|gbraid|wbraid)\b/i;
const city = "city ~ '[^[:space:]]'";

// Deliberately closed grammar, not a general SQL sanitizer. Every permitted
// statement has one COUNT(*) projection, approved predicates and no grouping.
// Extending the report requires reviewing this contract alongside the SQL.
const metrics = [
  ['calls_total', 'call_logs', 'created_at', ''],
  ['calls_answered', 'call_logs', 'created_at', "status = 'completed' AND duration_seconds > 0"],
  ['calls_with_lead', 'call_logs', 'created_at', 'lead_id IS NOT NULL'],
  ['leads_total', 'leads', 'created_at', ''],
  ['leads_with_city', 'leads', 'created_at', city],
  ['leads_with_city_and_source', 'leads', 'created_at', `${city} AND (source_page ~ '[^[:space:]]' OR utm_source ~ '[^[:space:]]')`],
  ['review_requests', 'leads', 'review_requested_at', ''],
  ['won', 'leads', 'won_at', ''],
];

export function assertAggregateSql(sql) {
  if (pii.test(sql)) throw new Error('Weekly counts SQL references a forbidden PII column.');
  // Only line comments are supported; reject psql commands and exotic quoting.
  if (/[\\"$]|\/\*|\*\//.test(sql)) throw new Error('Weekly counts SQL has unsupported syntax.');
  const normalized = sql.replace(/--[^\r\n]*/g, '').replace(/\s+/g, ' ').trim();
  const statements = normalized.split(';').map((statement) => statement.trim());
  if (statements.pop() !== '' || statements.length !== metrics.length) {
    throw new Error('Weekly counts SQL must contain exactly eight aggregate SELECTs.');
  }
  for (const [index, [metric, table, timestamp, extra]] of metrics.entries()) {
    const expected = `SELECT COUNT(*) AS ${metric} FROM public.${table} `
      + `WHERE is_test IS NOT TRUE AND ${timestamp} >= :'window_start'::timestamptz `
      + `AND ${timestamp} < :'window_end'::timestamptz${extra ? ` AND ${extra}` : ''}`;
    if (statements[index] !== expected) {
      throw new Error(`Weekly counts SQL violates the aggregate contract for ${metric}.`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assertAggregateSql(readFileSync(new URL('./utah-weekly-counts.sql', import.meta.url), 'utf8'));
  console.log('Utah weekly counts SQL: aggregate-only contract passed.');
}
