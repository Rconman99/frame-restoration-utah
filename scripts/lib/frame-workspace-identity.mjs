// Ryan's Frame Google Workspace sign-in, before and after the move to the
// framerestoration.com (no "s") domain. Renaming a Workspace user keeps the
// same Google account and keeps the old address as an alias, so both
// addresses name one identity. Evidence checks must accept either.

export const FRAME_WORKSPACE_IDENTITIES = Object.freeze([
  "ryan@framerestoration.com",
  "ryan@framerestorations.com",
]);

export function isFrameWorkspaceIdentity(value) {
  return typeof value === "string"
    && FRAME_WORKSPACE_IDENTITIES.includes(value.trim().toLowerCase());
}
