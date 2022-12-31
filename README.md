# raspberry-camera-ip
A camera IP stack for Raspberry pi

For snapshot:

1) check curl 'http://localhost:9997/v1/paths/list' | jq .items.fhd.sourceReady
2) if yes, capture a frame on the RTSP or other
3) if no, libcamera-jpeg !

Add Onvif endpoint
