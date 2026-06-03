#!/bin/bash
# Port allocation: base + (AGENT_INDEX * STEP)
#
# AGENT_INDEX 0 = human/local dev  →  ends in 0-9  (or 00-99)
# AGENT_INDEX 1 = first worker     →  ends in 10-19 (or 100-199)
# AGENT_INDEX 2 = second worker    →  ends in 20-29 (or 200-299)
# ...
#
# STEP=10  gives each agent a range of 10 ports  (default, supports up to 9 workers)
# STEP=100 gives each agent a range of 100 ports (change this line if >10 ports needed)
#
# Service bases:
#   api → 3000   (human=3000-3009, agent1=3010-3019, agent2=3020-3029, ...)
#   web → 4000   (human=4000-4009, agent1=4010-4019, agent2=4020-4029, ...)
#
# Default dev ports (api=3003, web=3000) fall naturally in the human range.
#
# Usage:
#   bash scripts/worktree-port.sh <service> <agent_index>
#
#   service:      api | web  (default: api)
#   agent_index:  0=human, 1=first worker, 2=second, ...  (default: 0)
#
# Examples:
#   bash scripts/worktree-port.sh api 0   → 3000  (human)
#   bash scripts/worktree-port.sh api 1   → 3010  (agent 1)
#   bash scripts/worktree-port.sh web 2   → 4020  (agent 2)
#   bash scripts/worktree-port.sh api     → 3000  (no index = human)

STEP=10
SERVICE=${1:-api}
AGENT_INDEX=${2:-0}

case "$SERVICE" in
  web) BASE=4000 ;;
  *)   BASE=3000 ;;
esac

echo $(( BASE + AGENT_INDEX * STEP ))
