#!/bin/sh
set -e

npm run generate:edition

if [ -n "$(git status --porcelain content/editions)" ]; then
  DATE=$(date +"%Y-%m-%d")
  git add content/editions
  git commit -m "publish: edition(s) for $DATE"
  git push
else
  echo "No new editions to commit."
fi
