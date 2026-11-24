#!/bin/sh
# Prepara la cartella da pubblicare: solo i file dell'app, con la versione del service worker legata al commit.
# Uso: sh scripts/prepara-sito.sh <cartella-destinazione> <sha-del-commit>
set -eu
DEST="$1"; SHA="$2"
mkdir -p "$DEST"
cp -r index.html manifest.webmanifest sw.js firebase-config.js js vendor fonts img icons "$DEST"/
touch "$DEST/.nojekyll"
SHORT=$(printf '%s' "$SHA" | cut -c1-12)
sed -i "s/^const VERSION = '.*';/const VERSION = 'nazifoski-$SHORT';/" "$DEST/sw.js"
grep -q "const VERSION = 'nazifoski-$SHORT';" "$DEST/sw.js"
