#!/bin/bash
cd /home/kavia/workspace/code-generation/vibrantsplit-91512-ca933a06/fairsplit_frontend_workspace/fairsplit_frontend
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

