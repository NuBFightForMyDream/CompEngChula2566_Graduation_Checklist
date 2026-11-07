#!/bin/sh
# สำรองฐานข้อมูลเป็นไฟล์ในเครื่อง ใช้ pg_dump จาก image ของ Postgres จึงไม่ต้องติดตั้งเพิ่ม
#   DATABASE_URL='postgres://...' pnpm db:backup
#
# ไฟล์นี้มีอีเมลและเกรดของผู้ใช้ เก็บไว้ในเครื่อง ห้ามขึ้น git หรือ GitHub Actions เพราะ repo นี้เป็น public
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "กรุณาตั้ง DATABASE_URL เช่น DATABASE_URL='postgres://...' pnpm db:backup" >&2
  exit 1
fi

cd "$(dirname "$0")/.."
mkdir -p backups
chmod 700 backups
file="backups/cp-roadmap-$(date +%Y%m%d-%H%M%S).dump"
umask 077

# ส่งรหัสผ่านผ่าน environment แทนการใส่ใน command line
docker run --rm -e DATABASE_URL postgres:17-alpine \
  sh -c 'pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL"' > "$file"

echo "สำรองแล้ว: $file ($(du -h "$file" | cut -f1))"
echo "กู้คืนด้วย: pg_restore --clean --if-exists --no-owner --no-privileges -d \"\$TARGET_DATABASE_URL\" $file"
