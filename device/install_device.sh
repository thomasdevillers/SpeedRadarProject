#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this installer with sudo." >&2
  exit 1
fi

DEVICE_SOURCE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
VERSION=$(tr -d '[:space:]' < "${DEVICE_SOURCE}/VERSION")
INSTALL_ROOT=/opt/roadsafe-radar
RELEASE_DIR="${INSTALL_ROOT}/releases/${VERSION}"

install -d -o root -g root -m 0755 "${INSTALL_ROOT}/releases" "${INSTALL_ROOT}/bootstrap"
install -d -o tomdev -g tomdev -m 0750 /var/lib/roadsafe-radar /var/lib/roadsafe-radar/spool /var/lib/roadsafe-radar/updates /var/log/roadsafe-radar
install -d -o root -g tomdev -m 0750 /etc/roadsafe-radar

if [[ -f /home/tomdev/Documents/SpeedRadarProject/radar_real_ocr.py && ! -f "${INSTALL_ROOT}/bootstrap/pre-cloud-radar_real_ocr.py" ]]; then
  install -o root -g root -m 0644 /home/tomdev/Documents/SpeedRadarProject/radar_real_ocr.py "${INSTALL_ROOT}/bootstrap/pre-cloud-radar_real_ocr.py"
fi

install -d -o root -g root -m 0755 "${RELEASE_DIR}"
for file in VERSION radar_core.py radar_real_ocr.py cloud_agent.py updater.py requirements.txt; do
  install -o root -g root -m 0644 "${DEVICE_SOURCE}/${file}" "${RELEASE_DIR}/${file}"
done
chmod 0755 "${RELEASE_DIR}/radar_real_ocr.py" "${RELEASE_DIR}/cloud_agent.py" "${RELEASE_DIR}/updater.py"
install -o root -g root -m 0755 "${DEVICE_SOURCE}/updater.py" "${INSTALL_ROOT}/bootstrap/updater.py"
if [[ -f "${DEVICE_SOURCE}/release-public-key.pem" ]]; then
  install -o root -g root -m 0644 "${DEVICE_SOURCE}/release-public-key.pem" /etc/roadsafe-radar/release-public-key.pem
else
  echo "WARNING: release-public-key.pem is absent; remote software updates will remain unavailable."
fi
ln -sfn "${RELEASE_DIR}" "${INSTALL_ROOT}/current"

if [[ ! -f /etc/roadsafe-radar/device.env ]]; then
  install -o root -g tomdev -m 0640 "${DEVICE_SOURCE}/default.env.example" /etc/roadsafe-radar/device.env
  echo "Created /etc/roadsafe-radar/device.env. No live service files were changed."
fi

if ! grep -Eq '^ROADSAFE_DEVICE_ID=.+$' /etc/roadsafe-radar/device.env \
  || ! grep -Eq '^ROADSAFE_DEVICE_SECRET=.+$' /etc/roadsafe-radar/device.env \
  || ! grep -Eq '^HIKVISION_RTSP_URL=rtsp://.+$' /etc/roadsafe-radar/device.env \
  || grep -q 'username:password' /etc/roadsafe-radar/device.env; then
  echo "Installation staged at ${RELEASE_DIR}, but device.env is not ready." >&2
  echo "Set the real HIKVISION_RTSP_URL, activate the device, then run this installer again." >&2
  exit 2
fi

install -o root -g root -m 0644 "${DEVICE_SOURCE}/systemd/run_radar.service" /etc/systemd/system/run_radar.service
install -o root -g root -m 0644 "${DEVICE_SOURCE}/systemd/roadsafe-cloud-agent.service" /etc/systemd/system/roadsafe-cloud-agent.service
install -o root -g root -m 0644 "${DEVICE_SOURCE}/systemd/roadsafe-updater.service" /etc/systemd/system/roadsafe-updater.service
install -o root -g root -m 0440 "${DEVICE_SOURCE}/systemd/roadsafe-radar.sudoers" /etc/sudoers.d/roadsafe-radar
install -o root -g root -m 0644 "${DEVICE_SOURCE}/systemd/roadsafe-radar.tmpfiles" /etc/tmpfiles.d/roadsafe-radar.conf
visudo -cf /etc/sudoers.d/roadsafe-radar
systemd-tmpfiles --create /etc/tmpfiles.d/roadsafe-radar.conf
systemctl daemon-reload
systemctl enable run_radar.service roadsafe-cloud-agent.service

echo "Installed RoadSafe device release ${VERSION}. Services were enabled but not restarted."
echo "After activation, restart with: sudo systemctl restart run_radar.service roadsafe-cloud-agent.service"
