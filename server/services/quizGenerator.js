const db = require('../db');
const { extractText } = require('./textExtractor');

const PROMPT_TEMPLATE = (subjectName, docTitle, context) => `
Bạn là trợ lý giáo dục chuyên nghiệp. Hãy tạo 10 câu hỏi trắc nghiệm bằng tiếng Việt cho tài liệu môn học "${subjectName}" có tiêu đề "${docTitle}".

Yêu cầu:
- Câu hỏi phải kiểm tra kiến thức học thuật hoặc bài tập rèn luyện thực tế liên quan đến nội dung
- Phù hợp với trình độ sinh viên đại học
- Mỗi câu có đúng 4 lựa chọn (A, B, C, D) và một đáp án đúng duy nhất
- "answer" là chỉ số 0-based của đáp án đúng (0=A, 1=B, 2=C, 3=D)
- Ưu tiên khai thác kiến thức trong nội dung tài liệu bên dưới

Trả về JSON thuần (không có markdown code fence), theo cấu trúc:
{
  "title": "Tên bộ đề ngắn gọn",
  "difficulty": "Dễ",
  "time_minutes": 10,
  "questions": [
    {
      "text": "Nội dung câu hỏi?",
      "options": ["Lựa chọn A", "Lựa chọn B", "Lựa chọn C", "Lựa chọn D"],
      "answer": 0
    }
  ]
}

Nội dung tài liệu:
${context}
`.trim();

function stripCodeFences(text) {
  return text
    .replace(/^```(?:json)?\s*/im, '')
    .replace(/\s*```$/im, '')
    .trim();
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function callGeminiWithRetry(prompt, apiKey) {
  const MODELS = ['gemini-2.5-flash-lite', 'gemini-3.5-flash', 'gemini-2.5-flash'];

  for (const modelName of MODELS) {
    let skipModel = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const url  = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
        const res  = await fetch(url, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        });
        const data = await res.json();

        if (res.ok) {
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!text) throw new Error('Response rỗng');
          console.log(`[QuizGen] OK: ${modelName} attempt ${attempt}`);
          return text;
        }

        const msg = data?.error?.message || res.statusText;
        console.warn(`[QuizGen] ${modelName} attempt ${attempt}: HTTP ${res.status} - ${msg?.slice(0, 100)}`);

        if (res.status === 404) { skipModel = true; break; }   // model không tồn tại → thử model khác
        if ((res.status === 503 || res.status === 429) && attempt < 3) {
          const waitMs = res.status === 429 ? attempt * 20000 : attempt * 10000; // 429: 20s/40s | 503: 10s/20s
          console.log(`[QuizGen] HTTP ${res.status} — chờ ${waitMs / 1000}s...`);
          await sleep(waitMs);
          continue;
        }
        skipModel = true; break;                                     // lỗi khác / hết lần thử → thử model khác
      } catch (e) {
        console.warn(`[QuizGen] ${modelName} attempt ${attempt} exception:`, e.message?.slice(0, 80));
        if (attempt < 3) { await sleep(3000); continue; }
        skipModel = true; break;
      }
    }
    if (!skipModel) break;
  }
  throw new Error('Tất cả model đều không phản hồi sau nhiều lần thử.');
}

async function generateQuizForDocument(documentId, title, description, subjectName, subjectId, filePath, fileType) {
  if (!process.env.GEMINI_API_KEY) {
    console.warn('[QuizGen] GEMINI_API_KEY not set — skipping.');
    return;
  }

  // Guard 1: bỏ qua nếu quiz đã tồn tại cho tài liệu này
  const [[existing]] = await db.query('SELECT id FROM quizzes WHERE document_id = ?', [documentId]);
  if (existing) {
    console.log(`[QuizGen] Quiz đã tồn tại cho document #${documentId}, bỏ qua.`);
    return;
  }

  // Guard 2: bỏ qua nếu đang xử lý hoặc đã thành công
  const [[doc]] = await db.query('SELECT quiz_status FROM documents WHERE id = ?', [documentId]);
  if (doc?.quiz_status === 'DONE' || doc?.quiz_status === 'PENDING') return;

  try {
    await db.query("UPDATE documents SET quiz_status = 'PENDING' WHERE id = ?", [documentId]);

    let context = await extractText(filePath, fileType);
    if (!context) context = [title, description].filter(Boolean).join('. ');
    context = context.slice(0, 4000);

    const prompt = PROMPT_TEMPLATE(subjectName, title, context);
    const raw    = await callGeminiWithRetry(prompt, process.env.GEMINI_API_KEY);
    const json   = stripCodeFences(raw);

    let quizData;
    try {
      quizData = JSON.parse(json);
    } catch {
      const match = json.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Gemini response không phải JSON hợp lệ.');
      quizData = JSON.parse(match[0]);
    }

    const questions = Array.isArray(quizData.questions) ? quizData.questions : [];
    if (!questions.length) throw new Error('Gemini trả về bộ đề không có câu hỏi.');

    const validDiff   = ['Dễ', 'Trung bình', 'Khó'];
    const difficulty  = validDiff.includes(quizData.difficulty) ? quizData.difficulty : 'Trung bình';
    const timeMinutes = Number.isInteger(quizData.time_minutes) ? quizData.time_minutes : 10;
    const quizTitle   = (quizData.title || title).slice(0, 200);

    const [quizResult] = await db.query(
      `INSERT INTO quizzes (title, subject_id, document_id, difficulty, time_minutes)
       VALUES (?, ?, ?, ?, ?)`,
      [quizTitle, subjectId, documentId, difficulty, timeMinutes]
    );
    const quizId = quizResult.insertId;

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.text || !Array.isArray(q.options) || q.options.length < 2) continue;
      const answer = (typeof q.answer === 'number') ? q.answer : 0;
      await db.query(
        'INSERT INTO questions (quiz_id, text, options, answer, sort_order) VALUES (?, ?, ?, ?, ?)',
        [quizId, q.text, JSON.stringify(q.options), answer, i + 1]
      );
    }

    await db.query("UPDATE documents SET quiz_status = 'DONE' WHERE id = ?", [documentId]);
    console.log(`[QuizGen] Quiz #${quizId} generated for document #${documentId}`);
  } catch (err) {
    console.error(`[QuizGen] Failed for document #${documentId}:`, err.message);
    await db.query("UPDATE documents SET quiz_status = 'FAILED' WHERE id = ?", [documentId]).catch(() => {});
  }
}

module.exports = { generateQuizForDocument };
