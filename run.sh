#!/bin/sh

SHARE_DIR=/share/navien

if [ ! -f $SHARE_DIR/Navien.js ]; then
	mkdir $SHARE_DIR
	mv /Navien.js $SHARE_DIR
fi

echo "[Info] Run Wallpad Controller"
cd $SHARE_DIR
node $SHARE_DIR/Navien.js

# for dev
#while true; do echo "still live"; sleep 100; done
