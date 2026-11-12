#!/bin/sh
# Tells Bing (and through it ChatGPT search and Copilot), Yandex and other IndexNow engines that the
# public pages changed, so they re-read them now instead of in days. Run after a deploy that changes
# the home page, prices or texts:  sh docker/indexnow.sh
# The key is public on purpose: it is served at https://myserviceuz.uz/43a812c94a5730805a8eb1b22b969e3d.txt
set -e
KEY=43a812c94a5730805a8eb1b22b969e3d
SITE=https://myserviceuz.uz
BODY="{\"host\":\"myserviceuz.uz\",\"key\":\"$KEY\",\"keyLocation\":\"$SITE/$KEY.txt\",\"urlList\":[\"$SITE/\",\"$SITE/ru\",\"$SITE/signup\",\"$SITE/install\",\"$SITE/llms.txt\"]}"
# api.indexnow.org passes the notice on to every IndexNow engine (Bing, Yandex, Seznam, Naver…).
for ENGINE in api.indexnow.org; do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' -m 20 -X POST "https://$ENGINE/indexnow" -H 'Content-Type: application/json; charset=utf-8' -d "$BODY" || echo 000)
  case "$CODE" in 200|202) echo "$ENGINE: qabul qilindi ($CODE)";; *) echo "$ENGINE: javob $CODE";; esac
done
