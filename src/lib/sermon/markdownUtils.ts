function processInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

export function markdownToHtml(md: string): string {
  const lines = md.split("\n");
  const blocks: string[] = [];
  let buffer = "";

  const flushBuffer = () => {
    const trimmed = buffer.trim();
    if (trimmed) blocks.push(`<p>${processInline(trimmed)}</p>`);
    buffer = "";
  };

  for (const line of lines) {
    if (line.startsWith("## ")) {
      flushBuffer();
      blocks.push(`<h2>${processInline(line.slice(3).trim())}</h2>`);
    } else if (line.startsWith("### ")) {
      flushBuffer();
      blocks.push(`<h3>${processInline(line.slice(4).trim())}</h3>`);
    } else if (line.trim() === "") {
      flushBuffer();
    } else {
      buffer += (buffer ? " " : "") + line;
    }
  }
  flushBuffer();

  return blocks.join("");
}
