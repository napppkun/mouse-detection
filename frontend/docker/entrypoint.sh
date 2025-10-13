#!/usr/bin/env sh
set -e

echo "== Runtime env check =="
for v in BACKEND_URL ANALYSIS_API REACT_APP_GOOGLE_CLIENT_ID REACT_APP_FIREBASE_API_KEY \
         REACT_APP_FIREBASE_AUTH_DOMAIN REACT_APP_FIREBASE_PROJECT_ID \
         REACT_APP_FIREBASE_STORAGE_BUCKET REACT_APP_MESSAGING_SENDER_ID \
         REACT_APP_FIREBASE_APP_ID REACT_APP_FIREBASE_MEASUREMENT_ID
do
  eval val=\$$v
  if [ -z "$val" ]; then
    echo "WARN: $v is empty"
  else
    echo "OK: $v set"
  fi
done

SRC_HTML="/usr/share/nginx/html/env.template.js"
SRC_ETC="/etc/nginx/templates/env.template.js"
DST="/usr/share/nginx/html/env.js"
SRC="$SRC_HTML"
[ -f "$SRC_ETC" ] && SRC="$SRC_ETC"
if [ -f "$SRC" ]; then
  echo "Generating $DST from $SRC ..."
  # บังคับรายการตัวแปรที่จะแทนค่า (กันกรณีอื่นโดนแทนเป็นค่าว่างโดยไม่รู้ตัว)
  VARS='${BACKEND_URL} ${ANALYSIS_API} ${REACT_APP_GOOGLE_CLIENT_ID} ${REACT_APP_FIREBASE_API_KEY} ${REACT_APP_FIREBASE_AUTH_DOMAIN} ${REACT_APP_FIREBASE_PROJECT_ID} ${REACT_APP_FIREBASE_STORAGE_BUCKET} ${REACT_APP_MESSAGING_SENDER_ID} ${REACT_APP_FIREBASE_APP_ID} ${REACT_APP_FIREBASE_MEASUREMENT_ID}'
  envsubst "$VARS" < "$SRC" > "$DST"
else
  echo "env.template.js not found; skipping"
fi

exec /docker-entrypoint.sh nginx -g 'daemon off;'
