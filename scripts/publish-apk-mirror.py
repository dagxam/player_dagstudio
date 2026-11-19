#!/usr/bin/env python3
"""Recover a shared-hosting APK mirror when ftp-deploy times out.

Uploads all APK bytes before the signed release manifest. A partial transfer
never becomes the advertised update. HTTPS/SHA256 validation is performed by
the following GitHub Actions step, not bypassed here.
"""
from __future__ import annotations

import ftplib
import hashlib
import json
import os
from pathlib import Path
import ssl
import time

ROOT = Path("apk-publish")
DEST = "/www/pl.dagstudio.ru/apk/"
CHUNK = 65536


def connect():
    protocol = os.getenv("FTP_PROTOCOL", "ftp").lower()
    if protocol not in ("ftp", "ftps"):
        raise ValueError("Only ftp or explicit ftps can use the verified FTP fallback")
    host = os.environ["FTP_SERVER"]
    port = int(os.getenv("FTP_PORT") or 21)
    ftp = (ftplib.FTP_TLS(context=ssl.create_default_context(), timeout=20)
           if protocol == "ftps" else ftplib.FTP(timeout=20))
    ftp.connect(host, port, timeout=20)
    ftp.login(os.environ["FTP_USERNAME"], os.environ["FTP_PASSWORD"])
    if protocol == "ftps":
        ftp.prot_p()
    ftp.set_pasv(True)
    ftp.cwd(DEST)
    return ftp


def upload(ftp, path, commit):
    name = path.name
    temporary = "." + name + ".part-" + commit[:12]
    with path.open("rb") as data:
        ftp.storbinary("STOR " + temporary, data, blocksize=CHUNK)
    expected_size = path.stat().st_size
    if ftp.size(temporary) != expected_size:
        raise IOError("Incomplete FTP staging upload: " + name)
    try:
        ftp.rename(temporary, name)
    except ftplib.error_perm:
        # Servers that do not permit rename-overwrite require an explicit
        # replacement. This occurs only *after* the staging upload is complete.
        ftp.delete(name)
        ftp.rename(temporary, name)
    if ftp.size(name) != expected_size:
        raise IOError("Published FTP file size mismatch: " + name)
    print("APK_MIRROR_FTP_UPLOADED", name, expected_size, flush=True)


def publish():
    version = os.environ["DAG_NATIVE_VERSION"]
    commit = os.environ["GITHUB_SHA"]
    base = version.removesuffix("-preview")
    versioned = ROOT / ("DAGSTUDIO-PLAYER-Preview-" + base + ".apk")
    stable = ROOT / "DAGSTUDIO-PLAYER-Preview.apk"
    manifest = ROOT / "DAGSTUDIO-PLAYER-native-version.json"
    metadata = json.loads(manifest.read_text(encoding="utf-8"))
    assert metadata["commit"] == commit
    assert metadata["version"] == version
    assert metadata["url"].endswith(versioned.name)
    assert hashlib.sha256(versioned.read_bytes()).hexdigest() == metadata["sha256"]
    assert stable.stat().st_size == versioned.stat().st_size
    for attempt in range(1, 4):
        ftp = None
        try:
            print("APK_MIRROR_FTP_RECOVERY_ATTEMPT", attempt, flush=True)
            ftp = connect()
            for file in (versioned, stable, manifest):
                upload(ftp, file, commit)
            ftp.quit()
            return
        except (OSError, ftplib.all_errors) as error:
            print("APK_MIRROR_FTP_RECOVERY_FAILED",
                  type(error).__name__, str(error)[:180], flush=True)
            if ftp is not None:
                try:
                    ftp.close()
                except OSError:
                    pass
            if attempt == 3:
                raise
            time.sleep(3 * attempt)


if __name__ == "__main__":
    publish()
