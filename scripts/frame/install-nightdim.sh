#!/usr/bin/env bash
# Install the night-dimming script on the frame (run from Git Bash at the repo root, frame on USB).
# Adds /system/su.d/60nightdim and one line to /system/bin/install-recovery.sh, then remounts /system read-only.
# Undo: scripts/frame/install-nightdim.sh --remove
set -euo pipefail
export MSYS2_ARG_CONV_EXCL="/data;/system;/sdcard;/sys"
if [ "${1:-}" = "--remove" ]; then
  adb shell "su -c 'mount -o remount,rw /system; rm -f /system/su.d/60nightdim; sed -i /60nightdim/d /system/bin/install-recovery.sh; mount -o remount,ro /system; settings put system screen_brightness 217'"
  echo removed; exit 0
fi
adb push scripts/frame/60nightdim /sdcard/60nightdim
adb shell "su -c 'mount -o remount,rw /system && cp /sdcard/60nightdim /system/su.d/60nightdim && chmod 700 /system/su.d/60nightdim && chown root:root /system/su.d/60nightdim && chcon u:object_r:system_file:s0 /system/su.d/60nightdim; grep -q 60nightdim /system/bin/install-recovery.sh || echo \"[ -x /system/su.d/60nightdim ] && /system/su.d/60nightdim\" >> /system/bin/install-recovery.sh; mount -o remount,ro /system; ls -lZ /system/su.d; cat /system/bin/install-recovery.sh'"
adb shell "su -c 'rmdir /dev/nightdim.lock 2>/dev/null; /system/su.d/60nightdim'"
echo "installed and started"
