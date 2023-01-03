# My Own IP Camera

## Description

A free docker stack to transform a device with camera with IP Camera.

## Limitations

Currently Raspberry PI is supported. We can easily isolate the services and have differents images for differents systems.

## Deploy

`./deploy.sh $camHostOrIp`

## Features

- Video (one size) RTSP + HLS + RTMP "on demand"
- Image directly from camera if possible else from video stream

## Why not next

- Improve image snapshot performances (reduce time)
- Various sizing for images (and videos ?)
- Main endpoint to access to URLS, and make actions
- Endpoint to reverse camera (flip)
- State save for flip and others configs
- Add time/date in frames
- Add Onvif endpoint
- Close camera on idle or requested with servo motor
- Detect with accelemeter (or similar) camera position and ajust auto flip
- Add audio
- Add led to say that cam is used
