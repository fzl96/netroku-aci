FROM curlimages/curl:8.11.0

COPY scheduler/tick.sh /tick.sh

ENTRYPOINT ["/bin/sh", "/tick.sh"]
