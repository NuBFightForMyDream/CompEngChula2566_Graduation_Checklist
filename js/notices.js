// notices.js — ประกาศที่เขียนมือ: โหลดไฟล์ Markdown ใน data/notices/ แล้วแปลงเป็น HTML แบบย่อ

// ประกาศ: ไฟล์ Markdown ที่เขียนมือ (ภาควิชา / หลักสูตร) ดึงมาแสดงตามที่ index.json ระบุ
async function loadNotices(files) {
  const box = $("notices"), list = $("notice-list");
  const texts = await Promise.all((files || []).map(f =>
    fetch("data/" + f, { cache: "no-cache" }).then(r => r.ok ? r.text() : null).catch(() => null)));
  const ok = texts.filter(Boolean);
  box.hidden = !ok.length;
  list.innerHTML = ok.map(t => `<article class="notice">${renderMarkdown(t)}</article>`).join("");
}

// Markdown แบบย่อ: หัวข้อ, รายการ, ตัวหนา, โค้ด, ลิงก์, ย่อหน้า
function renderMarkdown(md) {
  const inline = t => esc(t)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const out = [];
  let list = null;
  const flush = () => { if (list) { out.push(`<ul>${list.join("")}</ul>`); list = null; } };
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd();
    let m;
    if ((m = line.match(/^(#{1,3})\s+(.*)/))) { flush(); const h = m[1].length + 2; out.push(`<h${h}>${inline(m[2])}</h${h}>`); }
    else if ((m = line.match(/^\s*[-*]\s+(.*)/))) { (list ??= []).push(`<li>${inline(m[1])}</li>`); }
    else if ((m = line.match(/^>\s?(.*)/))) { flush(); out.push(`<p class="quote">${inline(m[1])}</p>`); }
    else if (!line.trim()) flush();
    else { flush(); out.push(`<p>${inline(line)}</p>`); }
  }
  flush();
  return out.join("");
}
