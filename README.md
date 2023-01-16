# My Own IP Camera

## Description

A free docker stack to transform a device with camera (+ servomotor) with IP Camera.

## Features

- Go to http://camHostOrIP/ to have URLS and actions
- Video RTSP + HLS + RTMP "on demand" (fhd/hd)
- Image (snapshot) directly from camera if possible else from video stream (fhd/hd with choose of quality)
- Rotation (each 90°)
- Shutter (hide the camera) open/close/auto, when auto open the shutter on snapshot and close after (with delay to avoid too openings in case of recording)
- Leds : if activated, the built-in leds will blink when camera is used (with the shutter, we don't want somebody see us without our knowledge)
- Some possible configurations ; see https://github.com/gallofeliz/js-libs/tree/master/src/config (warning: master to replace to good version)
  - shutter_enabled=true|false (default true)
  - shutter_openValue|closeValue=XX (default 12.5/2.5)
  - auth_publicView=true|false (default false)
  - auth_viewer_username|password=XX (default viewer/viewer)
  - auth_admin_username|password=XX (default admin/admin)
  - leds_enabled=true|false (default false)
- Get infos on `http://user:pass@192.168.1.16/infos` (default viewer:viewer for viewer and admin:admin for admin) ; response will depend on anonymous/logged user
```json
{
  "imageUrls": {
    "fhd": "http://viewer:viewer@192.168.1.16/fhd.jpg",
    "hd": "http://viewer:viewer@192.168.1.16/hd.jpg"
  },
  "videoUrls": {
    "rtsp": {
      "fhd": "rtsp://viewer:viewer@192.168.1.16/fhd",
      "hd": "rtsp://viewer:viewer@192.168.1.16/hd"
    },
    "hls": {
      "fhd": "http://viewer:viewer@192.168.1.16:8888/fhd",
      "hd": "http://viewer:viewer@192.168.1.16:8888/hd"
    },
    "rtmp": {
      "fhd": "rtmp://viewer:viewer@192.168.1.16/fhd",
      "hd": "rtmp://viewer:viewer@192.168.1.16/hd"
    }
  },
  "actions": {
    "shutterWrite": false,
    "rotateWrite": false,
    "systemWrite": false
  }
}
```

![](doc/ui.png)

## Limitations

- Currently Raspberry PI with its camera is supported. We can easily isolate the services and have differents images for differents systems, and for Raspberry PI I would like to support USB cameras.
- No ONVIF yet

## Environment

- Raspberry pi 3
- Camera for Raspberry pi
- SG90 servo motor, red cable on A 5.5V pin, brown cable on a ground pin, yellow cable on the GPIO 18 (12th pin) ; installed with something to hide the camera when closed and free the camera when open
- Raspberry pi OS with internet configured and docker engine
- Disable leds (/boot/config.txt)
```
dtparam=act_led_trigger=none
dtparam=act_led_activelow=off
dtparam=pwr_led_trigger=none
dtparam=pwr_led_activelow=off
```

![](doc/device-shutter-closed.jpg) ![](doc/device-shutter-open.jpg)

## Use (as user)

- You can call http/rtsp/etc endpoints to control and view your camera
- You can use https://github.com/gallofeliz/cameras-images-recorder to register and view pictures from your camera
- You can use any application for that, like MotionEye (https://github.com/motioneye-project/motioneye), VLC, any camera recorder that supports RTSP/HLS/RTMP/JPG camera

## Deploy

`./deploy.sh $camHostOrIp`

## Why not next
- Improve FHD/HD videos :
  - Reduce ffmpeg CPU footprint (use HLS ? Other ?)
  - Change all the config on rotate change (rename source to fhd if no clockwise) -> why not put rstp component inside the same container and start it with the app ; and/or put all the config from the app (as centralized point)
- Refactor code
- Add time/date in frames ?
- Support USB cameras ?

## Will not be done for the moment
- Detect with accelemeter (or similar) camera position and ajust auto rotate
- Add audio
- Add Onvif endpoint
  - https://github.com/kate-goldenring/onvif-camera-mocking (https://github.com/KoynovStas/onvif_srvd/blob/master/src/onvif_srvd.cpp)
  - https://www.happytimesoft.com/products/onvif-server/index.html
