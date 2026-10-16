#!/usr/bin/env python3
"""Create a private local signing key once. Back up these ignored files securely."""
from pathlib import Path
import secrets, subprocess
root=Path(__file__).resolve().parents[1]
properties=root/"signing.properties"
keystore=root/"rj-tecnico.jks"
if properties.exists() or keystore.exists():
    raise SystemExit("Signing files already exist; preserve the current key for future updates.")
password=secrets.token_urlsafe(32)
properties.write_text(f"storeFile=rj-tecnico.jks\nstorePassword={password}\nkeyAlias=rj-tecnico\nkeyPassword={password}\n")
properties.chmod(0o600)
# Password is supplied in the environment, not printed or placed on the command line.
import os
env=dict(os.environ,RJ_SIGNING_PASSWORD=password)
subprocess.run(["keytool","-genkeypair","-keystore",str(keystore),"-storepass:env","RJ_SIGNING_PASSWORD","-keypass:env","RJ_SIGNING_PASSWORD","-alias","rj-tecnico","-keyalg","RSA","-keysize","3072","-validity","10000","-dname","CN=RJ Compressores Portal Tecnico, O=RJ Compressores, C=BR"],env=env,check=True)
keystore.chmod(0o600)
result=subprocess.run(["keytool","-exportcert","-keystore",str(keystore),"-storepass:env","RJ_SIGNING_PASSWORD","-alias","rj-tecnico"],env=env,capture_output=True,check=True)
import hashlib,json
fingerprint=":".join(f"{b:02X}" for b in hashlib.sha256(result.stdout).digest())
destination=root.parent/"web/public/.well-known/assetlinks.json"
destination.parent.mkdir(parents=True,exist_ok=True)
if destination.exists():
    raise SystemExit("Existing assetlinks.json: merge the new signing certificate manually.")
destination.write_text(json.dumps([{"relation":["delegate_permission/common.handle_all_urls"],"target":{"namespace":"android_app","package_name":"app.rjcompressores.tecnico","sha256_cert_fingerprints":[fingerprint]}}],indent=2)+"\n")
print("Signing key created locally. Public fingerprint saved in assetlinks.json.")
