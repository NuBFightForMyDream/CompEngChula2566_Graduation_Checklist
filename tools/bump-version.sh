#!/bin/sh
# เปลี่ยนเลขเวอร์ชัน ?v=... ใน index.html เป็นวันเวลาปัจจุบัน
# รันทุกครั้งหลังแก้ไฟล์ใน css/ หรือ js/ เพื่อให้ผู้ใช้ได้ไฟล์ใหม่ทั้งชุด ไม่ติดแคชเก่า
#   sh tools/bump-version.sh
cd "$(dirname "$0")/.." || exit 1
v=$(date +%Y%m%d%H%M)
sed -i.bak -E "s/\?v=[0-9a-z]+/?v=$v/g; s/เวอร์ชันเว็บ [0-9a-z]+/เวอร์ชันเว็บ $v/" index.html && rm -f index.html.bak
echo "version -> $v"
