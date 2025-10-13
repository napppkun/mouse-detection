#!/bin/sh
set -e
echo "[entry] rendering /usr/share/nginx/html/env.js"
envsubst < /etc/nginx/templates/env.template.js > /usr/share/nginx/html/env.js
