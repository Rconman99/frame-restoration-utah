#!/usr/bin/env bash
set -euo pipefail
trap 'rc=$?; [ $rc -eq 0 ] || [ $rc -eq 2 ] || exit 2' EXIT
exec node "$(dirname "$0")/guard-core.mjs" paths
