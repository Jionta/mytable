#!/usr/bin/env python3
"""Set the workspace password without putting credentials into shell arguments."""
import argparse
import getpass
import hashlib
import os
from pathlib import Path
import secrets
import subprocess

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--generate', action='store_true', help='Generate a password and save it to a private local file.')
args = parser.parse_args()
password = secrets.token_urlsafe(24) if args.generate else getpass.getpass('New workspace password (at least 16 characters): ')
if len(password) < 16:
    raise SystemExit('Use a password with at least 16 characters.')
if not args.generate and getpass.getpass('Repeat password: ') != password:
    raise SystemExit('Passwords do not match.')
salt = secrets.token_hex(16)
digest = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000).hex()
if args.generate:
    path = root / 'credentials-grow.txt'
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as output:
        output.write('GROW workspace\nWebsite: https://os.iamjubayer.com\nPassword: ' + password + '\n\nKeep this file private. This file is excluded from Git.\n')
    print('Password saved privately to ' + str(path), flush=True)
command = [str(root / 'node_modules/.bin/wrangler'), 'secret', 'put', 'GROW_PASSWORD_HASH']
result = subprocess.run(command, input=salt + '$' + digest + '\n', text=True, cwd=root)
raise SystemExit(result.returncode)
