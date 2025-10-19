#!/bin/bash
set -euo pipefail

EDITION_DIR="content/editions"
CONFIG_FILE="config.yml"

FORCE=false
REQUESTED_DATE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force|-f)
      FORCE=true
      shift
      ;;
    *)
      REQUESTED_DATE="$1"
      shift
      break
      ;;
  esac
done

read_config() {
  node -e "
    const fs = require('fs');
    const yaml = require('yaml');
    const raw = fs.readFileSync('${CONFIG_FILE}', 'utf8');
    const config = yaml.parse(raw) || {};
    const tz = config.timezone || 'Europe/Paris';
    const digest = config.digest || {};
    const hour = Number.isInteger(digest.hour) ? digest.hour : 18;
    const minute = Number.isInteger(digest.minute) ? digest.minute : 0;
    console.log([tz, hour, minute].join('|'));
  "
}

IFS='|' read -r TIMEZONE THRESHOLD_HOUR THRESHOLD_MIN <<< "$(read_config)"
THRESHOLD_LABEL=$(printf "%02d:%02d" "$THRESHOLD_HOUR" "$THRESHOLD_MIN")

today=$(TZ="$TIMEZONE" date +%F)
now_ts=$(TZ="$TIMEZONE" date +%s)
threshold_ts=$(TZ="$TIMEZONE" date -j -f "%Y-%m-%d %H:%M" "$today $THRESHOLD_LABEL" +%s)
yesterday=$(TZ="$TIMEZONE" date -v -1d +%F)

target_date="$REQUESTED_DATE"

if [[ -n "$target_date" ]]; then
  echo " Using requested edition date: $target_date"
elif (( now_ts < threshold_ts )); then
  if [[ "$FORCE" == true ]]; then
    target_date="$today"
    echo " Force mode enabled before ${THRESHOLD_LABEL} ${TIMEZONE}. Regenerating today's edition for $target_date."
  else
    yesterday_file="$EDITION_DIR/${yesterday}.md"
    if [[ -f "$yesterday_file" ]]; then
      echo " It is before ${THRESHOLD_LABEL} ${TIMEZONE} and yesterday's edition exists. Skipping generation."
      exit 0
    else
      target_date="$yesterday"
      echo " Generating catch-up edition for $target_date (yesterday)."
    fi
  fi
else
  target_date="$today"
  if [[ "$FORCE" == true ]]; then
    echo " Force mode enabled after ${THRESHOLD_LABEL} ${TIMEZONE}. Regenerating today's edition for $target_date."
  else
    echo " After ${THRESHOLD_LABEL} ${TIMEZONE}. Generating today's edition for $target_date."
  fi
fi

npm run generate:edition -- "$target_date"

if [ -n "$(git status --porcelain "$EDITION_DIR")" ]; then
  git add "$EDITION_DIR"
  git commit -m "publish: edition(s) for $target_date"
  git push
else
  echo "No new editions to commit."
fi
