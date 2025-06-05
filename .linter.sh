#!/bin/bash
cd /home/kavia/workspace/code-generation/travelsmart-hub-38-0b9c91ff/travel_smart_hub
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

