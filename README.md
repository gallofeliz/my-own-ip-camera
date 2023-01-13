# My Own IP Camera

## Description

A free docker stack to transform a device with camera (+ servomotor) with IP Camera.

## Features

- Go to http://camHostOrIP/ to have URLS and actions
- Video (one size) RTSP + HLS + RTMP "on demand"
- Image (snapshot) directly from camera if possible else from video stream
- Shutter (hide the camera) open/close/auto, when auto open the shutter on snapshot and close after (with delay to avoid too openings in case of recording)

![](doc/mobile-index.png)

## Limitations

Currently Raspberry PI with its camera is supported. We can easily isolate the services and have differents images for differents systems.

## Environment

- Raspberry pi 3
- Camera for Raspberry pi
- SG90 servo motor, red cable on A 5.5V pin, brown cable on a ground pin, yellow cable on the GPIO 18 (12th pin) ; installed with something to hide the camera when closed and free the camera when open
- Raspberry pi OS with internet configured and docker engine

![](doc/device-shutter-closed.png) ![](doc/device-shutter-open.png)

## Deploy

`./deploy.sh $camHostOrIp`

## Why not next

- Empty config for rtsp service, the main service will setup and update it (needed for next)
- Improve image snapshot performances (reduce time)
- Various sizing for images (and videos ?)
- Front URLS from API
- State save for flip and others configs
- Add time/date in frames
- Add Onvif endpoint
  - https://github.com/kate-goldenring/onvif-camera-mocking (https://github.com/KoynovStas/onvif_srvd/blob/master/src/onvif_srvd.cpp)
  - https://www.happytimesoft.com/products/onvif-server/index.html
- Detect with accelemeter (or similar) camera position and ajust auto flip
- Add audio
- Add led to say that cam is used ?
- Disable rpi leds on startup

## Disable leds

`sudo bash -c 'echo 0 > /sys/class/leds/led0/brightness'`
`sudo bash -c 'echo 0 > /sys/class/leds/led1/brightness'`