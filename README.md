# raspberry-camera-ip
A camera IP stack for Raspberry pi

For snapshot:

1) check curl 'http://localhost:9997/v1/paths/list' | jq .items.fhd.sourceReady
2) if yes, capture a frame on the RTSP or other
3) if no, libcamera-jpeg !

- Add Onvif endpoint
- Add Snapshot endpoint
- Main app receives configs and configure (with api) localhost:9997 with good parameters
- Close camera on idle or requested with servo motor
- Detect with accelemeter (or similar) camera position and ajust auto flip
- Add audio
- Add led to say that cam is used
- Add time/date in frames
