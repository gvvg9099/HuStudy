const fs       = require('fs');
const mammoth  = require('mammoth');
const unzipper = require('unzipper');

const pdfParse = require('pdf-parse');

const MAX_CHARS = 4000;

async function extractText(filePath, fileType) {
  try {
    switch (fileType) {
      case 'PDF':  return await extractPdf(filePath);
      case 'DOCX': return await extractDocx(filePath);
      case 'PPTX': return await extractPptx(filePath);
      default:     return '';
    }
  } catch (err) {
    console.warn('[TextExtractor] Extraction failed:', err.message);
    return '';
  }
}

async function extractPdf(filePath) {
  const buf  = fs.readFileSync(filePath);
  const data = await pdfParse(buf);
  return (data.text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS);
}

async function extractDocx(filePath) {
  const result = await mammoth.extractRawText({ path: filePath });
  return (result.value || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS);
}

async function extractPptx(filePath) {
  const texts = [];
  const dir   = await unzipper.Open.file(filePath);
  for (const file of dir.files) {
    if (!file.path.match(/^ppt\/slides\/slide\d+\.xml$/)) continue;
    const buf  = await file.buffer();
    const xml  = buf.toString('utf8');
    const tags = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || [];
    tags.forEach(t => {
      const inner = t.replace(/<[^>]+>/g, '').trim();
      if (inner) texts.push(inner);
    });
  }
  return texts.join(' ').replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS);
}

module.exports = { extractText };
