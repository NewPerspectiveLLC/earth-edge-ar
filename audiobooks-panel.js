/* Personal audiobooks section for the Happy's Trails Vortex music panel.
   Playback is local to this device (HTML5 audio / speechSynthesis).
   Does not write the Master DJ queue or call /api/dj.
   The private Oct 22 retreat reading is not listed (public app). */
export function mount() {
  const host = document.getElementById("musAB");
  if (!host || host.dataset.ready) return;
  host.dataset.ready = "1";
  host.innerHTML = `
    <h3>📚 Audiobooks</h3>
    <p class="ab-note">On this device only — does not change the song for everyone. Cloned-voice readings of Chronicles, Karma, and Which Has More?, or the browser can read other books aloud.</p>
    <div class="ab-row" id="abQuick"></div>
    <label style="display:block">Book
      <select id="abBook"></select>
    </label>
    <label style="display:block">Chapter
      <select id="abChapter"></select>
    </label>
    <div id="abTtsRow">
      <label style="display:block">Voice <select id="abVoice"></select></label>
      <label style="display:block">Speed <input id="abRate" type="range" min="0.7" max="1.6" step="0.05" value="1"> <span id="abRateLabel">1.00×</span></label>
    </div>
    <div class="ab-row">
      <button type="button" id="abPlay" style="background:#a45cff;color:#fff;font-weight:bold">Play</button>
      <button type="button" id="abPause">Pause</button>
      <button type="button" id="abStop">Stop</button>
    </div>
    <input id="abSeek" type="range" min="0" max="1000" value="0" style="width:100%">
    <div style="display:flex;justify-content:space-between;font-size:11px;color:#bbb"><span id="abNow">0:00</span><span id="abEnd">0:00</span></div>
    <p class="ab-status" id="abStatus" aria-live="polite"></p>
    <div class="ab-page" id="abPage"></div>
    <audio id="abAudio" preload="metadata" playsinline></audio>
  `;

  const $ = (id) => document.getElementById(id);
  const bookSel = $("abBook");
  const chSel = $("abChapter");
  const voiceSel = $("abVoice");
  const rate = $("abRate");
  const audioEl = $("abAudio");
  const seek = $("abSeek");
  const pageEl = $("abPage");
  const STORE = "eear-audiobooks-v1";
  const API = (typeof location !== "undefined" && location.hostname.endsWith("github.io"))
    ? "https://matts-reality-live-geometry.fly.dev"
    : ((window.EEAR_API || ""));
  const api = (p) => fetch(API + p).then((r) => {
    if (r.ok) return r;
    if (!API) return r;
    return fetch(p);
  });

  let catalog = null, book = null, ttsChapters = [], chunks = [], chunkIndex = 0, speaking = false, paused = false, seeking = false;

  const fmt = (sec) => {
    if (!Number.isFinite(sec) || sec < 0) sec = 0;
    sec = Math.floor(sec);
    const m = Math.floor(sec / 60), s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };
  const setStatus = (t) => { $("abStatus").textContent = t || ""; };
  const loadState = () => { try { return JSON.parse(localStorage.getItem(STORE) || "{}"); } catch { return {}; } };
  const saveState = (p) => localStorage.setItem(STORE, JSON.stringify({ ...loadState(), ...p, updated: Date.now() }));
  const escapeHtml = (s) => String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function pauseWorldMusic() {
    // Personal listen: turn off the Music button if it is on, without touching the global DJ queue.
    const b = document.getElementById("musB");
    if (b && /Music: on/.test(b.textContent || "")) b.click();
  }

  function fillVoices() {
    if (!window.speechSynthesis) return;
    const voices = speechSynthesis.getVoices();
    const prev = voiceSel.value;
    voiceSel.innerHTML = "";
    const o0 = document.createElement("option");
    o0.value = "";
    o0.textContent = voices.length ? "System default" : "System voice (tap Play on iPhone)";
    voiceSel.appendChild(o0);
    voices.forEach((v, i) => {
      const o = document.createElement("option");
      o.value = String(i);
      o.textContent = `${v.name} (${v.lang})`;
      voiceSel.appendChild(o);
    });
    const saved = loadState().voiceIndex;
    if (prev) voiceSel.value = prev;
    else if (saved != null) voiceSel.value = String(saved);
  }

  function chunkText(text) {
    const clean = (text || "").replace(/\s+/g, " ").trim();
    if (!clean) return [];
    const parts = [], sentences = clean.split(/(?<=[.!?])\s+|\n{2,}/);
    let buf = "";
    for (const s of sentences) {
      if ((buf + " " + s).trim().length > 280) {
        if (buf) parts.push(buf.trim());
        if (s.length > 280) {
          for (let i = 0; i < s.length; i += 280) parts.push(s.slice(i, i + 280));
          buf = "";
        } else buf = s;
      } else buf = (buf + " " + s).trim();
    }
    if (buf) parts.push(buf.trim());
    return parts;
  }

  function renderLibrary(books) {
    const quick = $("abQuick");
    quick.innerHTML = "";
    bookSel.innerHTML = "";
    books.forEach((b) => {
      const o = document.createElement("option");
      o.value = b.id;
      o.textContent = b.title + (b.duration_label ? ` (${b.duration_label})` : "");
      bookSel.appendChild(o);
      if (b.mode === "audio") {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = b.title.replace(/^The /, "") + (b.duration_label ? ` · ${b.duration_label}` : "");
        btn.addEventListener("click", () => { bookSel.value = b.id; onBookChange(); onPlay(); });
        quick.appendChild(btn);
      }
    });
  }

  async function onBookChange() {
    stopAll();
    book = (catalog.books || []).find((b) => b.id === bookSel.value);
    if (!book) return;
    chSel.innerHTML = "";
    ttsChapters = [];
    $("abTtsRow").style.display = book.mode === "audio" ? "none" : "block";
    if (book.mode === "audio") {
      (book.chapters || []).forEach((ch) => {
        const o = document.createElement("option");
        o.value = ch.id;
        o.textContent = ch.title || ch.id;
        chSel.appendChild(o);
      });
      audioEl.src = book.audio_url || `/audiobooks/audio/${book.audio_id}`;
      $("abEnd").textContent = book.duration_label || fmt(book.duration || 0);
      pageEl.textContent = "Ready. Tap Play — this stays on your device.";
      if (!book.cues) {
        try {
          const r = await api(`/api/audiobooks/cues?book=${encodeURIComponent(book.id)}`);
          book.cues = (await r.json()).cues || [];
        } catch { book.cues = []; }
      }
      setStatus(book.status || "Cloned-voice audio.");
    } else {
      const r = await api(`/api/audiobooks/text?book=${encodeURIComponent(book.id)}`);
      const j = await r.json();
      ttsChapters = j.chapters || [];
      ttsChapters.forEach((ch) => {
        const o = document.createElement("option");
        o.value = ch.id;
        o.textContent = ch.title;
        chSel.appendChild(o);
      });
      if (ttsChapters[0]) await loadTtsChapter(ttsChapters[0].id);
    }
    saveState({ bookId: book.id });
  }

  async function loadTtsChapter(id) {
    stopSpeech();
    setStatus("Loading chapter…");
    const r = await api(`/api/audiobooks/text?book=${encodeURIComponent(book.id)}&chapter=${encodeURIComponent(id)}`);
    const j = await r.json();
    if (!r.ok) { pageEl.textContent = j.error || "Could not load chapter."; setStatus(j.error || "Error"); return; }
    pageEl.textContent = j.text || "";
    chunks = chunkText(j.text || "");
    chunkIndex = 0;
    $("abNow").textContent = "0";
    $("abEnd").textContent = String(chunks.length);
    seek.max = Math.max(chunks.length - 1, 1);
    seek.value = 0;
    setStatus(`Chapter loaded · ${chunks.length} spoken chunks.`);
    saveState({ bookId: book.id, chapterId: id, chunkIndex: 0 });
  }

  function stopSpeech() {
    speaking = false; paused = false;
    if (window.speechSynthesis) try { speechSynthesis.cancel(); } catch {}
  }
  function stopAll() {
    stopSpeech();
    try { audioEl.pause(); } catch {}
    $("abPlay").textContent = "Play";
  }

  function speakFrom(i) {
    if (!window.speechSynthesis) { setStatus("No speechSynthesis in this browser."); return; }
    if (!chunks.length) { setStatus("Nothing to read in this chapter."); return; }
    chunkIndex = Math.max(0, Math.min(i, chunks.length - 1));
    speaking = true; paused = false;
    $("abPlay").textContent = "Playing";
    const next = () => {
      if (!speaking) return;
      if (chunkIndex >= chunks.length) { speaking = false; $("abPlay").textContent = "Play"; setStatus("End of chapter."); return; }
      const u = new SpeechSynthesisUtterance(chunks[chunkIndex]);
      const voices = speechSynthesis.getVoices();
      const vi = voiceSel.value === "" ? -1 : Number(voiceSel.value);
      if (vi >= 0 && voices[vi]) u.voice = voices[vi];
      u.rate = Number(rate.value) || 1;
      u.onend = () => {
        if (!speaking || paused) return;
        chunkIndex += 1;
        seek.value = chunkIndex;
        $("abNow").textContent = String(chunkIndex);
        saveState({ bookId: book.id, chapterId: chSel.value, chunkIndex });
        next();
      };
      u.onerror = (e) => {
        if (e.error === "interrupted" || e.error === "canceled") return;
        setStatus("Voice error: " + (e.error || "unknown"));
        speaking = false; $("abPlay").textContent = "Play";
      };
      setStatus(`Reading chunk ${chunkIndex + 1} of ${chunks.length}`);
      speechSynthesis.speak(u);
    };
    try { speechSynthesis.cancel(); } catch {}
    next();
  }

  function onPlay() {
    if (!book) return onBookChange().then(onPlay);
    pauseWorldMusic();
    if (book.mode === "audio") {
      const p = audioEl.play();
      if (p && p.catch) p.catch((err) => setStatus("Could not play: " + err.message));
      $("abPlay").textContent = "Playing";
      setStatus("Playing cloned-voice audio on this device.");
      return;
    }
    if (paused && window.speechSynthesis && speechSynthesis.paused) {
      speechSynthesis.resume(); paused = false; speaking = true;
      $("abPlay").textContent = "Playing"; setStatus("Resumed."); return;
    }
    speakFrom(chunkIndex);
  }
  function onPause() {
    if (!book) return;
    if (book.mode === "audio") {
      audioEl.pause(); $("abPlay").textContent = "Play";
      saveState({ bookId: book.id, audioTime: audioEl.currentTime }); setStatus("Paused."); return;
    }
    if (window.speechSynthesis && speaking) {
      try { speechSynthesis.pause(); } catch {}
      paused = true; $("abPlay").textContent = "Play";
      setStatus("Paused.");
    }
  }
  function onStop() {
    if (!book) return;
    if (book.mode === "audio") {
      audioEl.pause(); audioEl.currentTime = 0; $("abPlay").textContent = "Play";
      saveState({ bookId: book.id, audioTime: 0 }); setStatus("Stopped."); return;
    }
    stopSpeech(); $("abPlay").textContent = "Play"; setStatus("Stopped.");
  }

  audioEl.addEventListener("timeupdate", () => {
    if (!book || book.mode !== "audio" || seeking) return;
    const d = audioEl.duration || book.duration || 1;
    seek.value = Math.round((audioEl.currentTime / d) * 1000);
    $("abNow").textContent = fmt(audioEl.currentTime);
    $("abEnd").textContent = fmt(d);
    if (Math.floor(audioEl.currentTime) % 5 === 0) saveState({ bookId: book.id, audioTime: audioEl.currentTime });
    if (book.cues && book.cues.length) {
      const t = audioEl.currentTime;
      let cur = null;
      for (const c of book.cues) if (c.start <= t && t < (c.end || c.start + 1)) cur = c;
      if (cur && pageEl.dataset.cue !== String(cur.start)) {
        pageEl.dataset.cue = String(cur.start);
        pageEl.innerHTML = escapeHtml(cur.text);
      }
    }
  });
  audioEl.addEventListener("ended", () => { $("abPlay").textContent = "Play"; setStatus("Finished."); });
  audioEl.addEventListener("play", () => { $("abPlay").textContent = "Playing"; });
  audioEl.addEventListener("pause", () => { if (audioEl.currentTime && audioEl.currentTime < (audioEl.duration || Infinity) - 0.2) $("abPlay").textContent = "Play"; });

  seek.addEventListener("input", () => { seeking = true; });
  seek.addEventListener("change", () => {
    seeking = false;
    if (!book) return;
    if (book.mode === "audio") {
      const d = audioEl.duration || book.duration || 1;
      audioEl.currentTime = (Number(seek.value) / 1000) * d;
      saveState({ bookId: book.id, audioTime: audioEl.currentTime });
    } else {
      chunkIndex = Number(seek.value) || 0;
      $("abNow").textContent = String(chunkIndex);
      if (speaking) speakFrom(chunkIndex);
    }
  });
  bookSel.addEventListener("change", onBookChange);
  chSel.addEventListener("change", () => {
    if (!book) return;
    if (book.mode === "audio") {
      const ch = (book.chapters || []).find((c) => c.id === chSel.value);
      if (ch && typeof ch.start === "number") { audioEl.currentTime = ch.start; setStatus("Jumped to " + ch.title); }
    } else loadTtsChapter(chSel.value);
  });
  rate.addEventListener("input", () => { $("abRateLabel").textContent = Number(rate.value).toFixed(2) + "×"; });
  $("abPlay").addEventListener("click", onPlay);
  $("abPause").addEventListener("click", onPause);
  $("abStop").addEventListener("click", onStop);
  if (window.speechSynthesis) { fillVoices(); speechSynthesis.addEventListener("voiceschanged", fillVoices); }

  function loadCatalog() {
    return api("/api/audiobooks/catalog")
      .then((r) => r.ok ? r.json() : Promise.reject(new Error("catalog " + r.status)))
      .catch(() => fetch("/audiobooks/catalog.json").then((r) => {
        if (!r.ok) throw new Error("catalog " + r.status);
        return r.json();
      }));
  }
  loadCatalog()
    .then((data) => {
      catalog = data;
      renderLibrary(data.books || []);
      const st = loadState();
      if (st.bookId && (data.books || []).some((b) => b.id === st.bookId)) bookSel.value = st.bookId;
      onBookChange();
    })
    .catch((err) => setStatus("Could not load audiobooks: " + err.message));
}
