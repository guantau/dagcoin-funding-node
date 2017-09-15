#!/usr/bin/env bash

rm -rf node_modules
rm conf.js

npm install

if [ "$1" == "development" -o "$1" == "testnet" ]; then
    ./testnetify.sh
fi

cp "environments/$1.conf.js" conf.js
