#!/bin/sh
set -eu
exec node src/exports/run-pdf-export-worker.js
