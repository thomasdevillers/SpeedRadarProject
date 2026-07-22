# Raspberry Pi pilot and rollback

The first installation is deliberately two-stage. Staging copies and tests the new software but leaves the currently running `run_radar.service` process untouched. Cutover happens only after Supabase, Vercel, DNS, OCR, Brevo, the signing public key, and a portal-provisioned activation token are ready.

## 1. Create a staging copy

From the development machine, copy `device/` to a new directory on the Pi. Do not overwrite `/home/tomdev/Documents/SpeedRadarProject/radar_real_ocr.py`.

On the Pi, validate with its existing virtual environment:

```bash
cd ~/roadsafe-device-stage
PYTHONPATH=. /home/tomdev/Documents/SpeedRadarProject/venv/bin/python -m unittest discover -s tests -v
/home/tomdev/Documents/SpeedRadarProject/venv/bin/python -m compileall -q .
```

Confirm that `run_radar.service` is still active and its current PID did not change.

## 2. Stage the root-owned release

```bash
cd ~/roadsafe-device-stage
sudo ./install_device.sh
```

The first invocation creates `/etc/roadsafe-radar/device.env`, copies a rollback copy of the original radar script, and then exits before replacing live systemd units because the device is not activated.

Edit only the hardware settings in `/etc/roadsafe-radar/device.env`:

```text
HIKVISION_RTSP_URL=rtsp://REAL_CAMERA_USER:REAL_CAMERA_PASSWORD@192.168.1.64:554/Streaming/Channels/101
RADAR_PORT=/dev/ttyUSB0
RADAR_BAUDRATE=115200
RADAR_DEFAULT_SPEED_LIMIT=60
```

## 3. Activate

Provision the radar in the RoadSafe admin portal and use its one-time token:

```bash
sudo /home/tomdev/Documents/SpeedRadarProject/venv/bin/python \
  /opt/roadsafe-radar/current/cloud_agent.py activate \
  --api-url https://portal.roadsafe.co.za \
  --token 'DEVICE_ID.ONE_TIME_SECRET' \
  --output /etc/roadsafe-radar/device.env
```

Activation merges cloud credentials into the environment file and preserves the camera/radar settings.

## 4. Install units, but do not cut over yet

```bash
sudo ./install_device.sh
sudo systemctl cat run_radar.service
sudo systemctl cat roadsafe-cloud-agent.service
sudo visudo -cf /etc/sudoers.d/roadsafe-radar
```

The original process is still running. The new definitions take effect only when restarted.

## 5. Controlled cutover

Choose a quiet traffic window and keep the SSH/Tailscale session open:

```bash
sudo systemctl restart run_radar.service roadsafe-cloud-agent.service
sleep 15
systemctl --no-pager --full status run_radar.service roadsafe-cloud-agent.service
journalctl -u run_radar.service -u roadsafe-cloud-agent.service -n 100 --no-pager
```

Use the admin portal to run `Capture test` and verify:

- radar, camera, and service health are green;
- heartbeats arrive within 60 seconds;
- a normal vehicle creates metadata without a photograph;
- an overspeed vehicle creates a private photograph;
- the event belongs to the active client assignment and speed limit;
- OCR is sensible and alert delivery is tested only with an internal RoadSafe recipient first.

Keep customer notifications disabled during the 48-hour pilot. Compare portal counts, queue depth, service logs, camera readiness, disk usage, and a manual sample of radar readings before enabling the client's recipients.

## Immediate rollback

The original script is preserved at `/opt/roadsafe-radar/bootstrap/pre-cloud-radar_real_ocr.py`. To restore the old unit, reinstall its saved unit definition from your system backup or point `ExecStart` back to:

```text
/home/tomdev/Documents/SpeedRadarProject/venv/bin/python /home/tomdev/Documents/SpeedRadarProject/radar_real_ocr.py
```

Then run:

```bash
sudo systemctl disable --now roadsafe-cloud-agent.service
sudo systemctl daemon-reload
sudo systemctl restart run_radar.service
```

Do not delete `/var/lib/roadsafe-radar`, the release directories, old captures, or the original script during the pilot. They are the forensic and rollback record.

