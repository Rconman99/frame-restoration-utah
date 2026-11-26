/**
 * TEST-ONLY harness for scripts/run-lead-migrations.sh.
 *
 * The shipped runner has NO test mode: no environment variable changes which
 * tools it uses, where its private root is, or which PATH it searches. That is
 * the point — and it means the suite cannot stub anything through the
 * environment. So this file does the substitution itself: it takes the shipped
 * script's bytes, rewrites a fixed, asserted list of production constants, and
 * returns the rewritten text for the suite to commit into its throwaway
 * repository. The runner's self-verification then compares the executed bytes
 * with `git show <RELEASE_SHA>:scripts/run-lead-migrations.sh` inside that
 * repository, so the check stays meaningful: it still proves the bytes that run
 * are the bytes that were committed and reviewed *there*, and a working-tree
 * edit after the commit still stops the run.
 *
 * This file lives under scripts/test/ and is never shipped or sourced by the
 * runner. The suite separately asserts that the shipped script contains no
 * test-mode switch.
 */

/** Exactly the production constants the suite is allowed to rewrite. */
export const SUBSTITUTIONS = [
  { name: "PATH", from: "PATH='/usr/bin:/bin:/usr/sbin:/sbin'\nexport PATH" },
  { name: "SHASUM", from: "SHASUM='/usr/bin/shasum'" },
  { name: "CURL", from: "CURL='/usr/bin/curl'" },
  { name: "TRUSTED_TMP_ROOT", from: "TRUSTED_TMP_ROOT='/private/tmp'" },
  { name: "JQ_CANDIDATES", from: "for jq_candidate in /opt/homebrew/bin/jq /usr/bin/jq; do" },
];

/**
 * @param {string} source the shipped script's bytes
 * @param {{harnessDir: string, privateRoot: string, jq: string}} options
 * @returns {string} the rewritten script
 */
export function rewriteForTests(source, { harnessDir, privateRoot, jq }) {
  const replacements = [
    // uname and anything else PATH-resolved comes from the harness first.
    {
      name: "PATH",
      from: SUBSTITUTIONS[0].from,
      to: `PATH='${harnessDir}:/usr/bin:/bin:/usr/sbin:/sbin'\nexport PATH`,
    },
    { name: "SHASUM", from: SUBSTITUTIONS[1].from, to: `SHASUM='${harnessDir}/shasum'` },
    { name: "CURL", from: SUBSTITUTIONS[2].from, to: `CURL='${harnessDir}/curl'` },
    // /private/tmp is a macOS path; the suite also runs on Linux CI.
    { name: "TRUSTED_TMP_ROOT", from: SUBSTITUTIONS[3].from, to: `TRUSTED_TMP_ROOT='${privateRoot}'` },
    {
      name: "JQ_CANDIDATES",
      from: SUBSTITUTIONS[4].from,
      to: `for jq_candidate in ${jq}; do`,
    },
  ];
  let out = source;
  for (const { name, from, to } of replacements) {
    if (!out.includes(from)) {
      throw new Error(
        `harness substitution "${name}" no longer matches the shipped runner; update scripts/test/lead-migration-runner-harness.mjs deliberately`,
      );
    }
    out = out.split(from).join(to);
  }
  return out;
}
