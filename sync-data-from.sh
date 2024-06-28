#!/bin/bash
rsync -az -e ssh $1:~/personal-projects/train-watcher/poll-status/data poll-status
rsync -az -e ssh $1:~/personal-projects/train-watcher/poll-webcam/data poll-webcam
