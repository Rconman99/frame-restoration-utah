#!/usr/bin/env node
/**
 * Fail-closed contract for Utah's shared mobile conversion UI.
 *
 * This freezes the behavior that keeps the contact dock useful without
 * covering long-form content: compact height, measured bottom reserve,
 * scroll-direction hiding, reduced-motion support, and no stacked exit panel.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const files = {
  critical: readFileSync(resolve(root, "global-critical.css"), "utf8"),
  full: readFileSync(resolve(root, "global.css"), "utf8"),
  behavior: readFileSync(resolve(root, "global-modal.js"), "utf8"),
  about: readFileSync(resolve(root, "pages", "about.html"), "utf8"),
};

const failures = [];
function requireNeedle(sourceName, needle, description) {
  if (!files[sourceName].includes(needle)) failures.push(`${sourceName}: ${description}`);
}

for (const needle of [
  "document.addEventListener('focusin'",
  "targetRect.top < navRect.bottom",
  "targetRect.bottom > dockRect.top",
  "window.scrollBy(0, targetRect.bottom - dockRect.top + 16)",
]) {
  requireNeedle("about", needle, `missing About-page keyboard focus settlement: ${needle}`);
}

for (const sourceName of ["critical", "full"]) {
  requireNeedle(
    sourceName,
    '.sticky-call[data-scroll-state="hidden"]',
    "missing the scroll-direction hidden state",
  );
  requireNeedle(
    sourceName,
    "var(--mobile-contact-bar-height",
    "mobile body/scroll reserve is not tied to the measured dock height",
  );
  requireNeedle(
    sourceName,
    ".sticky-call-microcopy { display: none; }",
    "redundant microcopy still consumes mobile viewport space",
  );
  requireNeedle(
    sourceName,
    "@media (prefers-reduced-motion: reduce)",
    "dock motion does not honor reduced-motion preferences",
  );
}

for (const needle of [
  "function installStickyBarBehavior()",
  "root.style.setProperty('--mobile-contact-bar-height'",
  "delta > 10",
  "delta < -10",
  "new ResizeObserver(syncReservedHeight).observe(bar)",
]) {
  requireNeedle("behavior", needle, `missing behavior contract: ${needle}`);
}

for (const forbidden of ["installExitIntent", "fr-exit-intent", "exit_intent_show"]) {
  if (files.behavior.includes(forbidden)) {
    failures.push(`behavior: mobile exit overlay contract returned (${forbidden})`);
  }
}

for (const [sourceName, source] of Object.entries({ critical: files.critical, full: files.full })) {
  const buttonHeight = source.match(/\.sticky-call-btn\s*\{[^}]*min-height:\s*(\d+)px/s);
  if (!buttonHeight) {
    failures.push(`${sourceName}: sticky button minimum height is missing`);
    continue;
  }
  const height = Number(buttonHeight[1]);
  if (height < 44 || height > 52) {
    failures.push(`${sourceName}: sticky button minimum height ${height}px must stay between 44px and 52px`);
  }
}

if (failures.length) {
  console.error("Mobile UI quality contract FAILED");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("PASS mobile UI quality contract: compact dock, reading guard, no stacked exit overlay");
