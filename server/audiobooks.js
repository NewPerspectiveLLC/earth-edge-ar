/* Personal audiobooks API for the Master DJ panel.
   Omits the private Oct 22 retreat reading and Complete Works Volume 2 Part M (WSBA). */
'use strict';
const fs = require('fs');
const path = require('path');

const PRIVATE_BOOKS = new Set(['oct22-retreat']);
const PRIVATE_AUDIO = new Set(['oct22']);
const AUDIO_FILES = {
  'chronicles-full': 'chronicles-64k-mono.mp3',
  'karma': 'karma-64k-mono.mp3',
  'which-has-more': 'which-has-more-64k-mono.mp3'
};
/* Part M occupies the gap between Part K and Part P in cw.txt. Never slice it. */
const PART_M_START = 79695; // 1-based inclusive
const PART_M_END = 80162;   // 1-based inclusive

let _catalog, _cwLines;

function loadJSON(p, fb) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fb; }
}
function catalog(root) {
  if (!_catalog) _catalog = loadJSON(path.join(root, 'audiobooks', 'catalog.json'), {books: []});
  return _catalog;
}
function cwLines(root) {
  if (!_cwLines) {
    const p = path.join(root, 'audiobooks', 'cw.txt');
    _cwLines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  }
  return _cwLines;
}
function bookById(root, id) {
  return (catalog(root).books || []).find(b => b.id === id) || null;
}
function overlapsPartM(start, end) {
  return !(end < PART_M_START || start > PART_M_END);
}
function chapterList(index) {
  return (index || []).map(c => ({id: c.id, title: c.title, approx_words: c.approx_words}));
}

function handle({root, u, q, r, send, limited, ip}) {
  const pth = u.pathname;
  if (limited && limited('ab:' + (ip || 'x'), 240, 60000)) return send(r, {error: 'rate limited'}, 429);
  if (q.method !== 'GET' && q.method !== 'HEAD') return send(r, {error: 'GET only'}, 405);

  if (pth === '/api/audiobooks/catalog' || pth === '/api/catalog') {
    const slim = JSON.parse(JSON.stringify(catalog(root)));
    slim.books = (slim.books || []).filter(b => !PRIVATE_BOOKS.has(b.id));
    for (const b of slim.books) delete b.cues;
    return send(r, slim);
  }
  if (pth === '/api/audiobooks/cues') {
    const id = u.searchParams.get('book') || '';
    if (PRIVATE_BOOKS.has(id)) return send(r, {error: 'not listed'}, 404);
    const book = bookById(root, id);
    if (!book) return send(r, {error: 'unknown book'}, 404);
    return send(r, {book: id, cues: book.cues || []});
  }
  if (pth === '/api/audiobooks/text') {
    return text(root, u, r, send);
  }
  if (pth.startsWith('/audiobooks/audio/')) {
    return audio(root, pth, q, r);
  }
  return false;
}

function text(root, u, r, send) {
  const bookId = u.searchParams.get('book') || '';
  const chapterId = u.searchParams.get('chapter') || '';
  if (PRIVATE_BOOKS.has(bookId)) return send(r, {error: 'not listed'}, 404);
  const book = bookById(root, bookId);
  if (!book) return send(r, {error: 'unknown book'}, 404);
  const textsDir = path.join(root, 'audiobooks', 'texts');
  if (book.slice_source || book.text_index) {
    const index = loadJSON(path.join(textsDir, book.text_index || 'complete-works-index.json'), []);
    if (!chapterId || chapterId === '__list__' || chapterId === 'list') {
      return send(r, {book: bookId, chapters: chapterList(index)});
    }
    const ch = index.find(c => c.id === chapterId);
    if (!ch) return send(r, {error: 'unknown chapter', chapters: chapterList(index)}, 404);
    const title = String(ch.title || '');
    if (/\bpart\s*m\b/i.test(title) || /wsba/i.test(title) || /ethics grievance/i.test(title)) {
      return send(r, {error: 'not listed'}, 404);
    }
    const start = +ch.start, end = +ch.end;
    if (!start || !end || overlapsPartM(start, end - 1)) {
      return send(r, {error: 'not listed'}, 404);
    }
    const lines = cwLines(root);
    const start0 = Math.max(0, start - 1);
    const end0 = Math.min(lines.length, end - 1);
    const text = lines.slice(start0, end0).join('\n');
    const meta = {};
    for (const k of Object.keys(ch)) if (k !== 'text') meta[k] = ch[k];
    return send(r, {book: bookId, chapter: meta, text});
  }
  const textId = book.text_book_id;
  if (!textId) return send(r, {error: 'no text source'}, 404);
  const chapters = loadJSON(path.join(textsDir, textId + '.json'), []);
  if (!chapterId) {
    return send(r, {book: bookId, chapters: chapters.map(c => ({id: c.id, title: c.title}))});
  }
  const ch = chapters.find(c => c.id === chapterId);
  if (!ch) return send(r, {error: 'unknown chapter'}, 404);
  return send(r, {book: bookId, chapter: {id: ch.id, title: ch.title}, text: ch.text || ''});
}

function audio(root, pth, q, r) {
  const audioId = decodeURIComponent(pth.split('/').pop() || '');
  if (PRIVATE_AUDIO.has(audioId)) { r.writeHead(404); return r.end('not listed'); }
  const fn = AUDIO_FILES[audioId];
  if (!fn) { r.writeHead(404); return r.end('unknown audio'); }
  const f = path.join(root, 'audio', 'audiobooks', fn);
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end('audio file missing'); }
  const stt = fs.statSync(f);
  const mime = 'audio/mpeg';
  const range = q.headers.range;
  const rg = range && /^bytes=(\d*)-(\d*)$/.exec(range);
  if (rg) {
    const a = rg[1] ? +rg[1] : 0;
    const z = rg[2] ? Math.min(+rg[2], stt.size - 1) : stt.size - 1;
    if (a > z || a < 0) {
      r.writeHead(416, {'content-range': `bytes */${stt.size}`, 'content-type': mime});
      return r.end();
    }
    r.writeHead(206, {
      'content-type': mime,
      'content-range': `bytes ${a}-${z}/${stt.size}`,
      'content-length': z - a + 1,
      'accept-ranges': 'bytes',
      'cache-control': 'private, max-age=3600'
    });
    if (q.method === 'HEAD') return r.end();
    return fs.createReadStream(f, {start: a, end: z}).on('error', () => r.end()).pipe(r);
  }
  r.writeHead(200, {
    'content-type': mime,
    'content-length': stt.size,
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=3600'
  });
  if (q.method === 'HEAD') return r.end();
  return fs.createReadStream(f).on('error', () => r.end()).pipe(r);
}

module.exports = {handle};
