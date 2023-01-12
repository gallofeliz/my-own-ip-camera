#!/usr/bin/env python3
import RPi.GPIO as GPIO
import time
import sys

GPIO.setmode(GPIO.BOARD)
GPIO.setwarnings(False)
pwm_gpio = 12
GPIO.setup(pwm_gpio, GPIO.OUT)
pwm = GPIO.PWM(pwm_gpio, 50)
pwm.start(float(sys.argv[1]))
time.sleep(1)
pwm.stop()
GPIO.cleanup()
