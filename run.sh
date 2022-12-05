#!/bin/sh

SHARE_DIR=/share/bestin

if [ ! -f $SHARE_DIR/bestin.js ]; then
	mkdir $SHARE_DIR
	mv /bestin.js $SHARE_DIR
fi

echo "[Info] Run Wallpad Controller"
cd $SHARE_DIR
node $SHARE_DIR/bestin.js

# for dev
#while true; do echo "still live"; sleep 100; done
