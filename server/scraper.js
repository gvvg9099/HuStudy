const cheerio = require('cheerio');

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.5',
};

async function fetchHtml(url) {
  const res = await fetch(url, { headers: FETCH_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} khi tải ${url}`);
  return res.text();
}

// Trả về mảng URL các trang quiz (đã sắp xếp) cho một mã môn học (slug) trên cauhoi.org
async function scrapeSubjectQuizUrls(subjectSlug) {
  const subjectUrl = `https://cauhoi.org/dai-hoc/bai-tap-de-thi-trac-nghiem-online-mon-${subjectSlug}/`;
  const html = await fetchHtml(subjectUrl);
  const $ = cheerio.load(html);

  const urls = new Set();
  // Link quiz có dạng: mon-{slug}-de-{number}
  const pattern = new RegExp(`mon-${subjectSlug}-de-`, 'i');

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (pattern.test(href)) {
      const abs = href.startsWith('http') ? href : `https://cauhoi.org${href}`;
      // Chuẩn hoá dấu / ở cuối URL
      urls.add(abs.endsWith('/') ? abs : abs + '/');
    }
  });

  return [...urls].sort();
}

// Phân tích một trang quiz; trả về { title, questions }
// questions: [{ text, options: string[4], answer: 0-3 }]
async function scrapeQuizPage(url) {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  // ── Tiêu đề ────────────────────────────────────────────────────────────
  let title = $('h1.entry-title').first().text().trim()
           || $('h1').first().text().trim()
           || $('title').text().split('–')[0].split('|')[0].trim();

  const questions = [];

  // ── Cách 1: dùng selector class của plugin AYS-PRO Quiz Maker ──────────
  // Plugin render sẵn toàn bộ câu hỏi trong HTML gốc (bị ẩn bằng JS nhưng vẫn còn trong DOM)
  const aysQuestions = $('[class*="ays-question-bank"], [class*="ays-question"]:not([class*="count"])');

  if (aysQuestions.length > 0) {
    aysQuestions.each((_, qEl) => {
      const $q = $(qEl);

      // Nội dung câu hỏi: đoạn text có nghĩa đầu tiên trước phần đáp án
      const $qClone = $q.clone();
      $qClone.find('ul, ol, [class*="answer"]').remove();
      const qText = $qClone.text()
        .replace(/^\s*Câu\s*\d+\s*[:\.]\s*/i, '')
        .replace(/^\s*\d+\s*[:\.]\s*/, '')
        .trim();
      if (!qText || qText.length < 5) return;

      const options = [];
      let answer = 0;

      // Đáp án đúng: dựa vào class .ays-right-answer HOẶC thẻ <strong>/<b> nằm trong li đáp án
      $q.find('[class*="answer-ul-li"], [class*="ays-answer"]').each((i, ansEl) => {
        const $ans = $(ansEl);
        const isCorrect =
          $ans.hasClass('ays-right-answer') ||
          $ans.find('> label > strong, > label > b, [class*="answer-text"] > strong, [class*="answer-text"] > b, strong, b').length > 0;

        const rawText = $ans.find('[class*="answer-text"], .ays-check-span').text().trim()
                     || $ans.text().trim();
        const optText = rawText.replace(/^[A-D][\.\)]\s*/i, '').trim();

        if (optText && options.length < 4) {
          if (isCorrect) answer = options.length;
          options.push(optText);
        }
      });

      if (options.length >= 2) {
        questions.push({ text: qText, options, answer });
      }
    });
  }

  // ── Cách 2: danh sách có thứ tự (ol) chứa các khối câu hỏi (dạng đáp án) ─
  if (questions.length === 0) {
    const contentEl = $('.entry-content, .post-content, article').first();
    const root = contentEl.length ? contentEl : $('body');

    root.find('ol > li').each((_, qEl) => {
      const $q = $(qEl);
      const $qClone = $q.clone();
      $qClone.find('ul, ol').remove();
      const qText = $qClone.text().trim();
      if (!qText || qText.length < 5) return;

      const options = [];
      let answer = 0;

      $q.find('> ul > li, > ol > li').each((_, ansEl) => {
        const $ans = $(ansEl);
        const isCorrect = $ans.find('strong, b').length > 0;
        const optText = $ans.text().replace(/^[A-D][\.\)]\s*/i, '').trim();

        if (optText && options.length < 4) {
          if (isCorrect) answer = options.length;
          options.push(optText);
        }
      });

      if (options.length >= 2) {
        questions.push({ text: qText, options, answer });
      }
    });
  }

  // ── Cách 3: các đoạn văn / khối nội dung theo mẫu A./B./C./D. ──────────
  if (questions.length === 0) {
    const blocks = [];
    $('p, li, div.question').each((_, el) => {
      blocks.push({
        text: $(el).text().trim(),
        hasStrong: $(el).find('strong, b').length > 0,
        $el: $(el),
      });
    });

    let i = 0;
    while (i < blocks.length) {
      const b = blocks[i];
      const isQuestion =
        /^(Câu\s*\d+\s*[:.])/i.test(b.text) ||
        (/^\d+\s*[.)]\s*.{10,}/.test(b.text) && i + 2 < blocks.length && /^[AB][\.\)]/i.test(blocks[i + 1]?.text));

      if (!isQuestion) { i++; continue; }

      const qText = b.text
        .replace(/^Câu\s*\d+\s*[:\.]\s*/i, '')
        .replace(/^\d+\s*[.)]\s*/, '')
        .trim();

      const options = [];
      let answer = 0;
      let j = i + 1;

      while (j < blocks.length && options.length < 4) {
        const ob = blocks[j];
        if (!/^[A-D][\.\)]/i.test(ob.text) && options.length > 0) break;
        if (/^[A-D][\.\)]/i.test(ob.text)) {
          const optText = ob.text.replace(/^[A-D][\.\)]\s*/i, '').trim();
          if (ob.hasStrong || ob.$el.closest('strong, b').length > 0) answer = options.length;
          options.push(optText);
        }
        j++;
      }

      if (options.length >= 2) {
        questions.push({ text: qText, options, answer });
      }
      i = options.length > 0 ? j : i + 1;
    }
  }

  return { title, questions };
}

module.exports = { scrapeSubjectQuizUrls, scrapeQuizPage };
