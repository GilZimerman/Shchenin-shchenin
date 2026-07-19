/* ===== טריוויה בדרכים v2 — מנחה חכם, אישי ומתפתח =====
   שכבות: UI (הקובץ הזה) | Engine (תוכן) | Learn (למידה) | Templates (שפה) | Bank (מאגר) */

const LS_KEY = "roadtrivia_v2";
const LS_KEY_V1 = "roadtrivia_v1";
const QUESTIONS_PER_ROUND = 5;

const GAME_TYPES = {
  head2head: { name: "ראש בראש", icon: "🥊", desc: "כל אחד בתורו מקבל שאלת טריוויה. תשובה נכונה = נקודה." },
  closest:   { name: "הכי קרוב מנצח", icon: "📏", desc: "שאלות מספריות. מי שקרוב יותר לתשובה לוקח את הנקודה." },
  truefalse: { name: "נכון או לא נכון", icon: "⚖️", desc: "עובדות מפתיעות. כל אחד מחליט — נכון או פייק?" },
  clues:     { name: "שלושה רמזים", icon: "🕵️", desc: "רמז ראשון = 3 נק', שני = 2, שלישי = 1." },
  choice:    { name: "אני יודע/ת מה תבחר/י", icon: "💘", desc: "שתי אפשרויות — מנחשים במה בן/בת הזוג יבחרו." },
  knowme:    { name: "מי מכיר את מי?", icon: "🧠", desc: "שאלות אישיות — מי מכיר את מי טוב יותר?" },
  hot:       { name: "חם, חם יותר", icon: "🔥", desc: "אינטימי, ברמה שבחרתם. תמיד אפשר לומר 'עוברים'." },
};

/* ---------- מצב ---------- */
let state = {
  players: null,           // {p1:{name,topics,avoid,humor,prefDiff,model}, p2:{...}}
  settings: {
    driver: "p2", intimacy: true, intimacyLevel: "personal",
    transitionsFreq: "balanced", learningEnabled: true,
    scoring: "comp", length: "medium", tts: false, grounding: true,
  },
  apiKey: "",
  scores: { p1: 0, p2: 0, team: 0 },
  shownIds: {},            // qid -> חותמת זמן הצגה אחרונה
  aiPool: {},              // qtype -> שאלות AI מאושרות (תור לא-מקוון)
  usedPrizes: [],
  roundsPlayed: 0,
  transitionsShown: [], lastTransitionKind: null, factsShown: [],
  savedRound: null,
  metrics: { roundsStarted: 0, roundsCompleted: 0, skips: 0, correct: 0, wrong: 0, feedback: 0, transitions: 0 },
};

let round = null;

/* ---------- עזרים ---------- */
const $ = (id) => document.getElementById(id);
const show = (id) => { document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden")); $(id).classList.remove("hidden"); };

function toast(msg, ms = 3200) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add("hidden"), ms);
}

function saveState() {
  const { players, settings, apiKey, scores, shownIds, aiPool, usedPrizes, roundsPlayed,
          transitionsShown, lastTransitionKind, factsShown, metrics } = state;
  const roundInProgress = round && !round.isTiebreak && round.idx < round.questions.length;
  const savedRound = roundInProgress ? serializeRound(round) : state.savedRound;
  localStorage.setItem(LS_KEY, JSON.stringify({
    players, settings, apiKey, scores, shownIds, aiPool, usedPrizes, roundsPlayed,
    transitionsShown, lastTransitionKind, factsShown, metrics, savedRound,
  }));
}

function serializeRound(r) {
  return { modeKey: r.modeKey, singleType: r.singleType, label: r.label, questions: r.questions,
           idx: r.idx, roundScores: r.roundScores, firstTarget: r.firstTarget,
           comebackOffered: r.comebackOffered, best: r.best, roundCats: r.roundCats };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY));
    if (saved && saved.players) { deepMerge(state, saved); return; }
    // הגירה מגרסה 1 — שומרים ניקוד, פרופיל והעדפות קיימות
    const v1 = JSON.parse(localStorage.getItem(LS_KEY_V1));
    if (v1 && v1.profile) {
      state.players = {
        p1: newPlayer(v1.profile.p1, v1.profile.topics),
        p2: newPlayer(v1.profile.p2, v1.profile.topics),
      };
      state.settings.driver = v1.profile.driver || "p2";
      state.settings.intimacy = !!v1.profile.intimacy;
      state.settings.intimacyLevel = v1.profile.intimacyLevel || "personal";
      state.settings.tts = !!v1.tts;
      state.settings.grounding = v1.grounding !== false;
      state.apiKey = v1.apiKey || "";
      state.scores.p1 = v1.scores?.p1 || 0;
      state.scores.p2 = v1.scores?.p2 || 0;
      (v1.usedQuestions || []).forEach(q => { state.shownIds["v1" + q.length] = Date.now(); });
      state.usedPrizes = v1.usedPrizes || [];
    }
  } catch (e) { /* מצב חדש */ }
}

function deepMerge(target, src) {
  for (const k of Object.keys(src)) {
    if (src[k] && typeof src[k] === "object" && !Array.isArray(src[k]) && target[k] && typeof target[k] === "object" && !Array.isArray(target[k])) {
      deepMerge(target[k], src[k]);
    } else target[k] = src[k];
  }
}

function newPlayer(name, topics) {
  return { name: name || "", topics: topics || "", avoid: "", humor: "שנון", prefDiff: "varied", model: Learn.emptyModel() };
}

function pName(pk) { return state.players[pk].name; }
function otherP(pk) { return pk === "p1" ? "p2" : "p1"; }
function totalScore(pk) { return state.scores[pk] + (round?.roundScores?.[pk] || 0); }
function isCoop() { return state.settings.scoring === "coop"; }

function speak(text) {
  if (!state.settings.tts || !("speechSynthesis" in window) || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "he-IL";
  u.rate = 0.95;
  speechSynthesis.speak(u);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- מחולל AI (Claude) ---------- */

const AI_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" }, answer: { type: "string" }, fact: { type: "string" },
          category: { type: "string" }, difficulty: { type: "string" },
          clues: { type: "array", items: { type: "string" } },
          options: { type: "array", items: { type: "string" } },
          sources: { type: "array", items: { type: "object",
            properties: { title: { type: "string" }, url: { type: "string" } },
            required: ["title", "url"], additionalProperties: false } },
        },
        required: ["question", "answer", "fact", "category", "difficulty", "clues", "options", "sources"],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
};

function playerBrief(pk) {
  const p = state.players[pk];
  const m = Learn.model(pk);
  const loved = Object.entries(m.categories)
    .filter(([, c]) => c.liked + c.more > 0).map(([n]) => n).slice(0, 4);
  return `${p.name}: נושאים אהובים — ${p.topics || "לא צוין"}${loved.length ? " (וגם למדנו שאוהב/ת: " + loved.join(", ") + ")" : ""}. ` +
         `רמת קושי מתאימה: ${Learn.difficultyWord(pk)}. סגנון הומור: ${p.humor}.` +
         (p.avoid ? ` נושאים רגישים שאסור להציג: ${p.avoid}.` : "");
}

function buildSystemPrompt(grounded) {
  const s = state.settings;
  const intimacyLevels = { flirty: "פלרטטנית ועדינה", personal: "אישית עד נועזת, באלגנטיות", daring: "נועזת אך מכבדת" };
  const blocked = Learn.blockedAll();
  const groundingRules = grounded ? `
- חובה: אמת כל עובדה בעזרת חיפוש ברשת לפני שאתה הופך אותה לשאלה.
- לכל שאלה עובדתית צרף בשדה sources רשימה של 1-3 אסמכתאות (title + url) שמאמתות את התשובה.
- אם לא מצאת אסמכתא ברורה — החלף את העובדה באחרת שכן מצאת לה מקור.` : "";
  return `אתה מנחה שנון, חם וקשוב של משחק טריוויה זוגי שמשוחק בקול בזמן נסיעה ברכב.
המשתתפים (זוג, בגירים):
- ${playerBrief("p1")}
- ${playerBrief("p2")}

כללים מחייבים:
- כל השאלות בעברית טבעית, מנוסחות להאזנה (משפטים קצרים).
- בשדה difficulty כתוב "קל", "בינוני" או "קשה" — והתאם את התמהיל לרמות של שני המשתתפים.
- מותר ואף רצוי לפנות למשתתפים בשמות בחלק מהשאלות האישיות, באופן טבעי ולא בכל שאלה.
${blocked.length ? `- נושאים שהמשתתפים חסמו — אסור בהחלט: ${blocked.join(", ")}.` : ""}
- לכל שאלת טריוויה חייבת להיות תשובה עובדתית אחת ברורה. אם אינך בטוח בעובדה — אל תשתמש בה.
- בלי שאלות טריק, בלי ניסוחים עמומים, לא יותר משאלת גיאוגרפיה אחת בחבילה.
- גוון קטגוריות; שדה fact — עובדה קצרה ומפתיעה.
- שאלות אינטימיות (אם יתבקשו): ברמה ${intimacyLevels[s.intimacyLevel] || "אישית"}, בטון משחקי ומכבד, בלי לחץ ובלי להפוך תשובות למבחן של הקשר. בלי עידוד מגע בזמן נהיגה.
- שדות לא רלוונטיים: מחרוזת ריקה או מערך ריק.${groundingRules}`;
}

function buildUserPrompt(type, count, grounded) {
  const recentIds = Object.keys(state.shownIds).length;
  const recentQs = [...new Set(Object.values(state.aiPool).flat().map(q => q.question).filter(Boolean))].slice(-40);
  const avoidBlock = recentQs.length ? `\n\nאל תיצור שאלות דומות לאלה (${recentIds} כבר הוצגו):\n- ${recentQs.join("\n- ")}` : "";
  const perType = {
    head2head: `צור ${count} שאלות טריוויה קלאסיות (שאלה + תשובה עובדתית קצרה + עובדה מעניינת). clues ו-options ריקים.`,
    closest: `צור ${count} שאלות אומדן מספריות — התשובה מספר מנוסח בקצרה (למשל "8,849 מטר"). clues ו-options ריקים.`,
    truefalse: `צור ${count} עובדות מפתיעות. בשדה question הטענה, בשדה answer בדיוק "נכון ✅" או "לא נכון ❌", בשדה fact הסבר. ערבב נכונות ושגויות. clues ו-options ריקים.`,
    clues: `צור ${count} חידות זיהוי: answer = מי/מה מזהים, clues = בדיוק 3 רמזים מהקשה לקל, fact = עובדה. question ריק, options ריק.`,
    choice: `צור ${count} דילמות "מה תבחר/י": options = בדיוק 2 אפשרויות מפתות ומנוגדות. שאר השדות ריקים.`,
    knowme: `צור ${count} שאלות "מי מכיר את מי" על העדפות/הרגלים של בן/בת הזוג. השתמש ב-{partner} במקום השם. שאר השדות ריקים.`,
    hot: `צור ${count} שאלות זוגיות אינטימיות ברמה שהוגדרה — שיחה פתוחה, רומנטית ומכבדת. מותר לשלב את השמות. שאר השדות ריקים.`,
  };
  const groundedSuffix = grounded ? `

חפש ברשת כדי לאמת את העובדות וצרף אסמכתאות. בסיום החזר אך ורק JSON תקין:
{"questions":[{"question":"...","answer":"...","fact":"...","category":"...","difficulty":"...","clues":[],"options":[],"sources":[{"title":"...","url":"..."}]}]}
בלי טקסט מחוץ ל-JSON.` : "";
  return perType[type] + avoidBlock + groundedSuffix;
}

const FACTUAL_TYPES = ["head2head", "closest", "truefalse", "clues"];

async function callClaude(body, timeoutMs = 120000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": state.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `שגיאת API (${res.status})`);
    }
    return await res.json();
  } finally { clearTimeout(timer); }
}

function extractJSON(text) {
  try { return JSON.parse(text); } catch (e) { /* ננסה לחלץ */ }
  const fenced = text.match(/```json\s*([\s\S]*?)```/);
  if (fenced) { try { return JSON.parse(fenced[1]); } catch (e) { /* ממשיכים */ } }
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
  throw new Error("פורמט תשובה לא תקין");
}

async function generateAIQuestions(type, count) {
  const grounded = state.settings.grounding && FACTUAL_TYPES.includes(type);
  const body = {
    model: "claude-opus-4-8",
    system: buildSystemPrompt(grounded),
    messages: [{ role: "user", content: buildUserPrompt(type, count, grounded) }],
  };
  let data;
  if (grounded) {
    body.max_tokens = 8000;
    body.tools = [{ type: "web_search_20260209", name: "web_search", max_uses: 6 }];
    data = await callClaude(body);
    let hops = 0;
    while (data.stop_reason === "pause_turn" && hops++ < 3) {
      body.messages = [body.messages[0], { role: "assistant", content: data.content }];
      data = await callClaude(body);
    }
  } else {
    body.max_tokens = 4096;
    body.output_config = { effort: "medium", format: { type: "json_schema", schema: AI_SCHEMA } };
    data = await callClaude(body);
  }
  if (data.stop_reason === "refusal") throw new Error("Claude סירב לבקשה הזו");
  const text = data.content.filter(b => b.type === "text").map(b => b.text).join("\n");
  const parsed = extractJSON(text);
  if (!parsed.questions?.length) throw new Error("לא התקבלו שאלות");
  return parsed.questions;
}

/* מילוי תור התוכן ברקע — כדי שלסיבוב הבא לא יחכו */
const prefetching = {};
function schedulePrefetch(type) {
  if (!state.apiKey || !type || prefetching[type]) return;
  if (Engine.poolGet(type).length >= QUESTIONS_PER_ROUND) return;
  prefetching[type] = true;
  generateAIQuestions(type, QUESTIONS_PER_ROUND)
    .then(qs => Engine.poolAdd(type, qs))
    .catch(e => console.warn("prefetch failed:", e))
    .finally(() => { prefetching[type] = false; });
}

/* ---------- תפריט ---------- */

function renderScores() {
  let html;
  if (isCoop() && round) {
    html = `<span class="p1">🤝 הצוות: ${round.roundScores.team || 0}</span>`;
  } else {
    html = `<span class="p1">${pName("p1")}: ${totalScore("p1")}</span><span>|</span><span class="p2">${pName("p2")}: ${totalScore("p2")}</span>`;
  }
  $("scorebox-menu").innerHTML = html;
  const g = $("scorebox-game");
  if (g) g.innerHTML = html;
}

function renderMenu() {
  round = null;
  renderScores();
  const s = state.settings;
  const ctx = buildCtx();
  $("menu-greeting").textContent = s.driver === "none"
    ? T("{{player_1_name}} ו{{player_2_name}} — מוכנים לקרב? 😏", ctx)
    : T("{{driver_name}} על ההגה 🚗 — עיניים לכביש! {{other}} מתפעל/ת את המשחק.", Object.assign(ctx, { other: pName(otherP(s.driver)) }));
  $("menu-learning").textContent = Learn.confidencePhrase();

  // מצבי משחק חכמים
  const mg = $("mode-grid");
  mg.innerHTML = "";
  Object.entries(Engine.MODES).forEach(([key, mode]) => {
    if (key === "adult" && !s.intimacy) return;
    const card = document.createElement("div");
    card.className = "game-card" + (key === "adult" ? " hot" : "");
    card.innerHTML = `<span class="g-icon">${mode.name.split(" ").pop()}</span><span class="g-name">${mode.name.replace(/ \S+$/, "")}</span>`;
    card.onclick = () => key === "adult" ? openAdultDialog() : startRound({ modeKey: key });
    mg.appendChild(card);
  });

  // משחקונים קלאסיים
  const grid = $("game-grid");
  grid.innerHTML = "";
  Object.entries(GAME_TYPES).forEach(([key, g]) => {
    if (key === "hot" && !s.intimacy) return;
    const card = document.createElement("div");
    card.className = "game-card" + (key === "hot" ? " hot" : "");
    card.innerHTML = `<span class="g-icon">${g.icon}</span><span class="g-name">${g.name}</span><span class="g-desc">${g.desc}</span>`;
    card.onclick = () => startRound({ singleType: key });
    grid.appendChild(card);
  });

  // כפתורי מצב
  document.querySelectorAll("#scoring-chips .chip").forEach(c =>
    c.classList.toggle("active", c.dataset.scoring === s.scoring));
  document.querySelectorAll("#length-chips .chip").forEach(c =>
    c.classList.toggle("active", c.dataset.len === s.length));

  // באנר המשך משחק שמור
  $("resume-banner").classList.toggle("hidden", !state.savedRound);

  $("ai-status").textContent = !state.apiKey
    ? "📚 מאגר מובנה + תור תוכן מקומי. הוסיפו מפתח API בהגדרות למאגר אינסופי."
    : state.settings.grounding
      ? "🌐 מאגר אינסופי + אימות אסמכתאות פעיל"
      : "🤖 מאגר אינסופי פעיל";
  show("screen-menu");
}

/* ---------- התחלת סיבוב ---------- */

async function startRound({ modeKey, singleType, resume }) {
  let questions, label, idx = 0, roundScores = { p1: 0, p2: 0, team: 0 }, firstTarget, comebackOffered = false, best = null, roundCats = null;

  if (resume && state.savedRound) {
    const r = state.savedRound;
    ({ modeKey, singleType, label } = r);
    questions = r.questions; idx = r.idx;
    roundScores = Object.assign({ team: 0 }, r.roundScores);
    firstTarget = r.firstTarget; comebackOffered = r.comebackOffered; best = r.best; roundCats = r.roundCats;
    state.savedRound = null;
  } else {
    const grounded = state.settings.grounding && singleType && FACTUAL_TYPES.includes(singleType);
    $("loading-text").textContent = !state.apiKey
      ? "מערבבים את הקלפים... 🃏"
      : grounded ? "Claude מחפש ומאמת אסמכתאות ברשת... 🌐" : "מרכיבים לכם סיבוב מותאם... 🎛️";
    $("loading").classList.remove("hidden");

    const length = singleType ? QUESTIONS_PER_ROUND
      : (modeKey === "quick" ? 5 : Engine.LENGTHS[state.settings.length] || Engine.MODES[modeKey]?.len || 6);

    // אם התור והמאגר דלים ויש מפתח — יוצרים עכשיו
    if (state.apiKey && singleType) {
      const fresh = Engine.poolTake(singleType, 99).length;
      if (fresh < length) {
        try { Engine.poolAdd(singleType, await generateAIQuestions(singleType, Math.max(length, 5))); }
        catch (e) { toast(`⚠️ בעיה במחולל ה-AI (${e.message}) — ממשיכים מהמאגר`); }
      }
    }
    questions = Engine.buildRound(modeKey, singleType, length);
    $("loading").classList.add("hidden");
    if (!questions.length) { toast("לא נשארו שאלות מתאימות — נסו לשחרר נושא חסום ⚙️"); return; }

    label = singleType ? `${GAME_TYPES[singleType].icon} ${GAME_TYPES[singleType].name}`
                       : Engine.MODES[modeKey]?.name || "סיבוב";
    firstTarget = state.roundsPlayed % 2 === 0 ? "p1" : "p2";
    state.metrics.roundsStarted++;
    // מילוי התור ברקע לסיבוב הבא
    schedulePrefetch(singleType || questions[0]?.qtype);
  }

  round = {
    modeKey, singleType, label, questions, idx, roundScores,
    clueStage: 0, firstTarget, isTiebreak: false,
    comebackOffered, doubleFor: null, best, roundCats: roundCats || { p1: {}, p2: {} },
    qShownAt: 0,
  };
  show("screen-game");
  proceedToQuestion(idx > 0);
}

function currentTarget() {
  return (round.idx % 2 === 0) ? round.firstTarget : otherP(round.firstTarget);
}

/* ---------- צינור: מעבר ← קאמבק ← שאלה ---------- */

function proceedToQuestion(skipExtras) {
  $("comeback-offer").classList.add("hidden");
  maybeTransition(skipExtras);
  if (!skipExtras && shouldOfferComeback()) { showComebackOffer(); return; }
  renderQuestion();
}

const TRANSITION_PROB = { few: 0.15, balanced: 0.4, many: 0.65 };

function maybeTransition(skip) {
  const el = $("q-transition");
  el.classList.add("hidden");
  if (skip || round.idx === 0 || round.isTiebreak) return;
  if (Math.random() > (TRANSITION_PROB[state.settings.transitionsFreq] || 0.4)) return;
  const text = pickTransition(buildCtx({ current_player_name: pName(currentTarget()) }));
  if (!text) return;
  el.textContent = text;
  el.classList.remove("hidden");
  state.metrics.transitions++;
  speak(text);
}

function shouldOfferComeback() {
  if (isCoop() || round.isTiebreak || round.comebackOffered) return false;
  const diff = Math.abs(totalScoreRound("p1") - totalScoreRound("p2"));
  const threshold = round.questions.length <= 6 ? 2 : 3; // בסיבוב קצר גם פער 2 מרגיש גדול
  if (diff < threshold) return false;
  const trailing = totalScoreRound("p1") < totalScoreRound("p2") ? "p1" : "p2";
  return currentTarget() === trailing;
}

function totalScoreRound(pk) { return round.roundScores[pk] || 0; }

function showComebackOffer() {
  round.comebackOffered = true;
  const trailing = totalScoreRound("p1") < totalScoreRound("p2") ? "p1" : "p2";
  const ctx = buildCtx();
  $("comeback-text").textContent = T(
    "אתגר קאמבק! 🔥 {{trailing_player_name}} מאחור ב-{{score_difference}} — אם שניכם מסכימים, השאלה הבאה של {{trailing_player_name}} שווה נקודה כפולה. בלי שינויים בחשאי — רק בהסכמה!",
    ctx);
  $("comeback-offer").classList.remove("hidden");
  speak($("comeback-text").textContent);
  $("btn-comeback-yes").onclick = () => { round.doubleFor = trailing; toast("נקודה כפולה על השאלה הבאה! 🔥"); $("comeback-offer").classList.add("hidden"); renderQuestion(); };
  $("btn-comeback-no").onclick = () => { $("comeback-offer").classList.add("hidden"); renderQuestion(); };
}

/* ---------- רינדור שאלה ---------- */

function renderQuestion() {
  const q = round.questions[round.idx];
  const type = q.qtype;
  Engine.markShown(q);
  renderScores();

  $("game-type-badge").textContent = round.label + (round.singleType ? "" : ` · ${GAME_TYPES[type].icon}`);
  $("q-counter").textContent = round.isTiebreak ? "⚡ שובר שוויון!" : `שאלה ${round.idx + 1} מתוך ${round.questions.length}`;

  ["q-clues", "q-options", "q-answer", "q-fact", "q-sources"].forEach(id => {
    $(id).classList.add("hidden");
    $(id).innerHTML = "";
  });
  $("feedback-bar").classList.add("hidden");
  document.querySelectorAll("#feedback-bar .chip").forEach(c => c.classList.remove("done"));
  round.clueStage = 0;
  round.qShownAt = Date.now();

  const target = currentTarget();
  const targetName = pName(target);
  const partnerName = pName(otherP(target));
  const actions = $("game-actions");
  actions.innerHTML = "";

  const doubled = round.doubleFor === target ? 2 : 1;
  const dblTag = doubled > 1 ? " · נקודה כפולה 🔥" : "";
  let questionText = (q.question || "").replaceAll("{partner}", partnerName)
                                       .replaceAll("{{partner}}", partnerName);
  let speakText = "";

  switch (type) {
    case "head2head": {
      $("q-target").textContent = `🎯 התור של ${targetName}${dblTag}`;
      $("q-category").textContent = q.category || "";
      $("q-text").textContent = questionText;
      speakText = `${targetName}, ${questionText}`;
      addBtn(actions, "חשיפת התשובה 👀", "warn wide", () => {
        revealAnswer(q);
        showFeedback(q);
        actions.innerHTML = "";
        addBtn(actions, `תשובה נכונה! ✅ (+${doubled})`, "primary wide", () => award(q, target, doubled, true));
        addBtn(actions, "לא נכון 😅", "wide", () => award(q, target, 0, false));
      });
      break;
    }
    case "closest": {
      $("q-target").textContent = `📏 שניכם עונים — הכי קרוב מנצח${dblTag}`;
      $("q-category").textContent = q.category || "";
      $("q-text").textContent = questionText;
      speakText = questionText + " שניכם, תגידו מספר!";
      addBtn(actions, "חשיפת התשובה 👀", "warn wide", () => {
        revealAnswer(q);
        showFeedback(q);
        actions.innerHTML = "";
        if (isCoop()) {
          addBtn(actions, "הייתם קרובים! ✅ (נקודה לצוות)", "primary wide", () => award(q, "team", 1, true));
          addBtn(actions, "רחוקים 😅", "wide", () => award(q, "team", 0, false));
        } else {
          addBtn(actions, `${pName("p1")} קרוב/ה יותר ✅`, "primary", () => award(q, "p1", round.doubleFor === "p1" ? 2 : 1, true));
          addBtn(actions, `${pName("p2")} קרוב/ה יותר ✅`, "warn", () => award(q, "p2", round.doubleFor === "p2" ? 2 : 1, true));
          addBtn(actions, "תיקו 🤝 (נקודה לשניים)", "wide", () => awardBoth(q, 1));
        }
      });
      break;
    }
    case "truefalse": {
      $("q-target").textContent = "⚖️ שניכם מכריזים: נכון או לא נכון?";
      $("q-category").textContent = q.category || "";
      $("q-text").textContent = questionText;
      speakText = "נכון או לא נכון: " + questionText;
      addBtn(actions, "חשיפת האמת 👀", "warn wide", () => {
        revealAnswer(q);
        showFeedback(q);
        actions.innerHTML = "";
        if (isCoop()) {
          addBtn(actions, "לפחות אחד צדק ✅ (נקודה לצוות)", "primary wide", () => award(q, "team", 1, true));
          addBtn(actions, "שניכם טעיתם 😅", "wide", () => award(q, "team", 0, false));
        } else {
          addBtn(actions, `${pName("p1")} צדק/ה ✅`, "primary", () => award(q, "p1", 1, true));
          addBtn(actions, `${pName("p2")} צדק/ה ✅`, "warn", () => award(q, "p2", 1, true));
          addBtn(actions, "שניהם צדקו 🎉", "", () => awardBoth(q, 1));
          addBtn(actions, "אף אחד 😅", "", () => award(q, null, 0, false));
        }
      });
      break;
    }
    case "clues": {
      $("q-target").textContent = `🕵️ התור של ${targetName} לזהות${dblTag}`;
      $("q-category").textContent = q.category || "";
      $("q-text").textContent = "מי או מה אני?";
      $("q-clues").classList.remove("hidden");
      showClue(q, 0);
      speakText = `${targetName}, מי או מה אני? רמז ראשון: ${q.clues?.[0] || ""}`;
      renderClueActions(q, target, doubled);
      break;
    }
    case "choice": {
      $("q-target").textContent = `💘 ${targetName} מנחש/ת מה ${partnerName} בוחר/ת${dblTag}`;
      $("q-category").textContent = "";
      $("q-text").textContent = `${partnerName} — תחליט/י בלב. ${targetName} — נחש/י בקול!`;
      $("q-options").classList.remove("hidden");
      (q.options || []).forEach(opt => {
        const d = document.createElement("div");
        d.className = "opt";
        d.textContent = opt;
        $("q-options").appendChild(d);
      });
      speakText = `${partnerName}, בחר/י בלב: ${(q.options || []).join(", או ")}. ${targetName}, מה הניחוש שלך?`;
      showFeedback(q);
      addBtn(actions, `ניחוש נכון! 🎯 (+${doubled})`, "primary wide", () => award(q, isCoop() ? "team" : target, doubled, true));
      addBtn(actions, "פספוס 😅", "wide", () => award(q, target, 0, false));
      break;
    }
    case "knowme": {
      $("q-target").textContent = `🧠 ${targetName} עונה על ${partnerName}. ${partnerName} שופט/ת!${dblTag}`;
      $("q-category").textContent = "";
      $("q-text").textContent = questionText;
      speakText = `${targetName}: ${questionText}`;
      showFeedback(q);
      addBtn(actions, `קלע/ה בול! 🎯 (+${doubled})`, "primary wide", () => award(q, isCoop() ? "team" : target, doubled, true));
      addBtn(actions, "קרוב אבל לא 😅", "wide", () => award(q, target, 0, false));
      break;
    }
    case "hot": {
      $("q-target").textContent = `🔥 שאלה ל${targetName} — תמיד אפשר לומר "עוברים"`;
      $("q-category").textContent = "";
      $("q-text").textContent = questionText;
      speakText = `${targetName}: ${questionText}`;
      showFeedback(q);
      addBtn(actions, `ענה/תה בכנות ❤️ (+${doubled})`, "pink wide", () => award(q, isCoop() ? "team" : target, doubled, true));
      addBtn(actions, "עוברים 🙈 (בלי לאבד נקודות)", "wide", () => { state.metrics.skips++; skipQuestion(q, target); });
      break;
    }
  }

  speak(speakText);
}

/* ---------- ניקוד, למידה ומעבר ---------- */

function award(q, who, pts, correct) {
  const target = currentTarget();
  const ms = Date.now() - round.qShownAt;
  // אותות למידה
  if (["head2head", "clues", "choice", "knowme", "hot"].includes(q.qtype)) {
    Learn.record(target, { category: q.category || GAME_TYPES[q.qtype].name, correct, ms, qtype: q.qtype });
  } else if (who === "p1" || who === "p2") {
    Learn.record(who, { category: q.category, correct: true, ms, qtype: q.qtype });
  }
  state.metrics[correct ? "correct" : "wrong"]++;

  if (who && pts > 0) {
    round.roundScores[who] = (round.roundScores[who] || 0) + pts;
    trackHighlight(q, who, pts);
  }
  if (who === target || who === "team") round.doubleFor = null;
  trackRoundCat(target, q, correct);
  nextQuestion();
}

function awardBoth(q, pts) {
  round.roundScores.p1 += pts;
  round.roundScores.p2 += pts;
  const ms = Date.now() - round.qShownAt;
  Learn.record("p1", { category: q.category, correct: true, ms, qtype: q.qtype });
  Learn.record("p2", { category: q.category, correct: true, ms, qtype: q.qtype });
  state.metrics.correct += 2;
  nextQuestion();
}

function skipQuestion(q, target) {
  Learn.record(target, { category: q.category || GAME_TYPES[q.qtype].name, skipped: true, qtype: q.qtype });
  nextQuestion();
}

function trackHighlight(q, who, pts) {
  if (!round.best || pts > round.best.pts) {
    round.best = { pts, who, text: q.question || q.answer || (q.options || []).join(" / ") };
  }
}

function trackRoundCat(pk, q, correct) {
  if (pk !== "p1" && pk !== "p2") return;
  const cat = q.category || GAME_TYPES[q.qtype].name;
  const rc = round.roundCats[pk];
  if (!rc[cat]) rc[cat] = { shown: 0, correct: 0 };
  rc[cat].shown++;
  if (correct) rc[cat].correct++;
}

function nextQuestion() {
  renderScores();
  round.idx++;
  saveState(); // שמירת נקודת המשך
  if (round.idx < round.questions.length) {
    proceedToQuestion();
  } else if (!isCoop() && round.roundScores.p1 === round.roundScores.p2 && !round.isTiebreak) {
    startTiebreak();
  } else {
    endRound();
  }
}

function startTiebreak() {
  const tb = shuffle(TIEBREAKERS.filter(t => !Engine.wasShownRecently(t)));
  const q = Object.assign({ qtype: "closest" }, tb[0] || TIEBREAKERS[Math.floor(Math.random() * TIEBREAKERS.length)]);
  round.isTiebreak = true;
  round.questions.push(q);
  toast("⚡ תיקו! שאלת שובר שוויון — הכי קרוב לוקח את הסיבוב");
  renderQuestion();
}

/* ---------- חשיפת תשובה, רמזים, משוב ---------- */

function revealAnswer(q) {
  if (q.answer) { $("q-answer").textContent = q.answer; $("q-answer").classList.remove("hidden"); }
  if (q.fact) { $("q-fact").textContent = q.fact; $("q-fact").classList.remove("hidden"); }
  if (Array.isArray(q.sources) && q.sources.length) {
    const wrap = $("q-sources");
    wrap.innerHTML = "";
    const label = document.createElement("span");
    label.className = "src-label";
    label.textContent = "📚 אסמכתאות:";
    wrap.appendChild(label);
    q.sources.slice(0, 3).forEach(s => {
      if (!s?.url) return;
      const a = document.createElement("a");
      a.href = s.url; a.target = "_blank"; a.rel = "noopener noreferrer";
      a.textContent = "🔗 " + (s.title || s.url);
      wrap.appendChild(a);
    });
    wrap.classList.remove("hidden");
  }
  speak(`התשובה: ${q.answer || ""}. ${q.fact || ""}`);
}

function showClue(q, stage) {
  const pts = [3, 2, 1][stage];
  const div = document.createElement("div");
  div.className = "clue";
  div.innerHTML = `<span class="pts">רמז ${stage + 1} · שווה ${pts} נק'</span><br>`;
  div.appendChild(document.createTextNode(q.clues?.[stage] || ""));
  $("q-clues").appendChild(div);
}

function renderClueActions(q, target, doubled) {
  const actions = $("game-actions");
  actions.innerHTML = "";
  const pts = [3, 2, 1][round.clueStage] * (doubled || 1);
  addBtn(actions, `זיהוי נכון! 🎯 (+${pts})`, "primary wide", () => {
    revealAnswer(q);
    showFeedback(q);
    setTimeout(() => award(q, isCoop() ? "team" : target, pts, true), 1600);
  });
  if (round.clueStage < 2) {
    addBtn(actions, "רמז נוסף בבקשה 🙏", "warn wide", () => {
      round.clueStage++;
      showClue(q, round.clueStage);
      speak(q.clues?.[round.clueStage] || "");
      renderClueActions(q, target, doubled);
    });
  } else {
    addBtn(actions, "נכנעים 🏳️ — מה התשובה?", "wide", () => {
      revealAnswer(q);
      showFeedback(q);
      actions.innerHTML = "";
      addBtn(actions, "לשאלה הבאה ⬅️", "primary wide", () => award(q, null, 0, false));
    });
  }
}

function showFeedback(q) {
  const bar = $("feedback-bar");
  bar.classList.remove("hidden");
  bar._q = q;
}

document.querySelectorAll("#feedback-bar .chip").forEach(chip => {
  chip.onclick = () => {
    const q = $("feedback-bar")._q;
    if (!q) return;
    const kind = chip.dataset.fb;
    const cat = q.category || GAME_TYPES[q.qtype]?.name || "כללי";
    Learn.feedback("p1", kind, cat);
    Learn.feedback("p2", kind, cat);
    state.metrics.feedback++;
    chip.classList.add("done");
    const msgs = {
      like: "נרשם! עוד מהטוב הזה בדרך 👍", less: "הבנו — נוריד מזה 👎",
      more: `סימנתם שאתם רוצים עוד ${cat} ➕`, harder: "מעלים רמה 🔺", easier: "מורידים הילוך 🔻",
      block: `הנושא "${cat}" הוסר. אפשר להחזיר במסך 🧠`,
    };
    toast(msgs[kind] || "נרשם!");
    saveState();
  };
});

function addBtn(parent, text, cls, onclick) {
  const b = document.createElement("button");
  b.className = "btn " + cls;
  b.textContent = text;
  b.onclick = onclick;
  parent.appendChild(b);
}

/* ---------- סיום סיבוב ---------- */

function endRound() {
  const rs = round.roundScores;
  state.savedRound = null;
  state.metrics.roundsCompleted++;
  state.roundsPlayed++;

  let title, emoji = "🏆";
  const ctx = buildCtx();
  if (isCoop()) {
    const total = round.questions.length;
    const goal = Math.ceil(total * 0.6);
    const win = (rs.team || 0) >= goal;
    emoji = win ? "🤝" : "💪";
    title = win
      ? T(`כל הכבוד {{player_1_name}} ו{{player_2_name}} — ${rs.team}/${total} נכונות! ניצחתם את המשחק יחד!`, ctx)
      : T(`${rs.team || 0} מתוך ${total} — המשחק ניצח הפעם. סיבוב נקמה משותף?`, ctx);
    $("result-score").textContent = `היעד היה ${goal} תשובות נכונות`;
  } else {
    state.scores.p1 += rs.p1;
    state.scores.p2 += rs.p2;
    const winner = rs.p1 > rs.p2 ? "p1" : rs.p2 > rs.p1 ? "p2" : null;
    emoji = winner ? "🏆" : "🤝";
    title = winner
      ? T(WIN_LINES[Math.floor(Math.random() * WIN_LINES.length)], { winner: pName(winner), loser: pName(otherP(winner)) })
      : TIE_LINES[Math.floor(Math.random() * TIE_LINES.length)];
    $("result-score").textContent =
      `${pName("p1")} ${rs.p1} — ${rs.p2} ${pName("p2")}   |   סה"כ בנסיעה: ${state.scores.p1} — ${state.scores.p2}`;
  }
  $("result-emoji").textContent = emoji;
  $("result-title").textContent = title;

  // רגעים מצטיינים
  const hl = $("result-highlights");
  hl.innerHTML = "";
  if (round.best && round.best.who !== "team") {
    addHl(hl, `⭐ רגע הסיבוב: ${pName(round.best.who)} עם ${round.best.pts} נקודות על "${(round.best.text || "").slice(0, 60)}"`);
  }
  ["p1", "p2"].forEach(pk => {
    const cats = Object.entries(round.roundCats[pk]).filter(([, c]) => c.correct > 0)
      .sort((a, b) => b[1].correct - a[1].correct);
    if (cats.length) addHl(hl, `📚 ${pName(pk)} הצטיין/ה בקטגוריית ${cats[0][0]}`);
  });

  // פרס
  let available = PRIZES.filter(p => !state.usedPrizes.includes(p));
  if (!available.length) { state.usedPrizes = []; available = PRIZES; }
  const prize = available[Math.floor(Math.random() * available.length)];
  state.usedPrizes.push(prize);
  $("result-prize").textContent = prize;

  // שפת למידה כנה + הצעה חכמה למשחק הבא
  $("result-learning").textContent = Learn.confidencePhrase();
  const suggestion = suggestNext();
  $("result-suggestion").textContent = suggestion.text;
  const sBtn = $("btn-suggested");
  sBtn.textContent = suggestion.btnText;
  sBtn.classList.remove("hidden");
  sBtn.onclick = () => startRound(suggestion.launch);

  const lastLaunch = round.singleType ? { singleType: round.singleType } : { modeKey: round.modeKey };
  $("btn-again").onclick = () => startRound(lastLaunch);
  round = null;
  saveState();
  show("screen-result");
  speak(`${title}. ${prize}`);
}

function addHl(parent, text) {
  const d = document.createElement("div");
  d.className = "hl";
  d.textContent = text;
  parent.appendChild(d);
}

/* הצעה למשחק הבא לפי מה שנלמד */
function suggestNext() {
  const use = {};
  Object.keys(GAME_TYPES).forEach(t => {
    use[t] = (Learn.model("p1").typeUse[t] || 0) + (Learn.model("p2").typeUse[t] || 0);
  });
  if (!state.settings.intimacy) delete use.hot;
  const conf = (Learn.confidence("p1") + Learn.confidence("p2")) / 2;
  if (conf < 0.3) {
    // בתחילת הדרך — מגוונים כדי ללמוד
    const least = Object.entries(use).sort((a, b) => a[1] - b[1])[0][0];
    return { text: `עוד לא ניסיתם את "${GAME_TYPES[least].name}" — שווה בדיקה!`,
             btnText: `${GAME_TYPES[least].icon} ל${GAME_TYPES[least].name}`, launch: { singleType: least } };
  }
  return { text: "לפי מה שאהבתם — ערבוב חכם ירכיב לכם את הסיבוב המושלם.",
           btnText: "🎲 לערבוב חכם", launch: { modeKey: "smart" } };
}

/* ---------- מסך "מה המשחק למד עלינו?" ---------- */

function openLearnedDialog() {
  const box = $("learned-content");
  box.innerHTML = "";
  ["p1", "p2"].forEach(pk => {
    const s = Learn.summary(pk);
    const d = document.createElement("div");
    d.className = "learned-player";
    const conf = s.confidence < 0.25 ? "עוד אין מספיק מידע — שחקו עוד קצת"
      : s.confidence < 0.6 ? "מתחילים להבין" : "מבוססות";
    let html = `<h4>${pName(pk)}</h4><p>העדפות (${conf} · ${s.samples} שאלות):</p>`;
    d.innerHTML = html;
    if (s.strong.length) {
      const p = document.createElement("p");
      p.textContent = "💪 חזק/ה ב: " + s.strong.map(c => `${c.name} (${c.rate}%)`).join(", ");
      d.appendChild(p);
    }
    if (s.loved.length) {
      const p = document.createElement("p");
      p.textContent = "❤️ נהנה/ית מ: " + s.loved.join(", ");
      d.appendChild(p);
    }
    const pd = document.createElement("p");
    pd.textContent = `🎚️ רמת קושי נוכחית: ${s.difficulty}` + (s.avgSeconds ? ` · ⏱️ תגובה ממוצעת: ${s.avgSeconds} שנ'` : "");
    d.appendChild(pd);
    if (s.blocked.length) {
      const p = document.createElement("p");
      p.append("🚫 נושאים חסומים: ");
      s.blocked.forEach(cat => {
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.append(cat);
        const x = document.createElement("button");
        x.textContent = "✕";
        x.title = "החזרת הנושא";
        x.onclick = () => { Learn.unblock("p1", cat); Learn.unblock("p2", cat); toast(`"${cat}" חזר למשחק ✅`); openLearnedDialog(); };
        tag.appendChild(x);
        p.appendChild(tag);
      });
      d.appendChild(p);
    }
    box.appendChild(d);
  });
  const m = state.metrics;
  const stats = document.createElement("p");
  stats.className = "hint";
  stats.textContent = `📊 נתוני שימוש (מקומיים בלבד): ${m.roundsCompleted}/${m.roundsStarted} סיבובים הושלמו · ${m.correct} נכונות · ${m.skips} דילוגים · ${m.feedback} משובים`;
  box.appendChild(stats);
  $("learn-enabled").checked = state.settings.learningEnabled;
  $("dlg-learned").showModal();
}

/* ---------- אתחול, טפסים ואירועים ---------- */

function fillSetupForm() {
  if (!state.players) return;
  ["p1", "p2"].forEach(pk => {
    const p = state.players[pk];
    $(`inp-${pk}-name`).value = p.name;
    $(`inp-${pk}-topics`).value = p.topics;
    $(`inp-${pk}-diff`).value = p.prefDiff;
    $(`inp-${pk}-humor`).value = p.humor;
    $(`inp-${pk}-avoid`).value = p.avoid;
  });
  const s = state.settings;
  $("inp-driver").value = s.driver;
  $("inp-transitions").value = s.transitionsFreq;
  $("inp-intimacy").value = s.intimacy ? "on" : "off";
  $("inp-intimacy-level").value = s.intimacyLevel;
  $("inp-apikey").value = state.apiKey;
  updateDriverLabels();
}

function updateDriverLabels() {
  const n1 = $("inp-p1-name").value.trim() || "משתתף/ת 1";
  const n2 = $("inp-p2-name").value.trim() || "משתתף/ת 2";
  const sel = $("inp-driver");
  sel.options[0].textContent = n2;
  sel.options[1].textContent = n1;
}
$("inp-p1-name").addEventListener("input", updateDriverLabels);
$("inp-p2-name").addEventListener("input", updateDriverLabels);

function collectSetup(useDefaults) {
  const keepModel = pk => state.players?.[pk]?.model || Learn.emptyModel();
  // גם בדילוג על ההיכרות — השמות נלקחים מהטופס (הם תמיד חובה לשיח אישי)
  const mk = (pk, defName) => ({
    name: $(`inp-${pk}-name`).value.trim() || defName,
    topics: useDefaults ? "" : $(`inp-${pk}-topics`).value.trim(),
    prefDiff: useDefaults ? "varied" : $(`inp-${pk}-diff`).value,
    humor: useDefaults ? "שנון" : $(`inp-${pk}-humor`).value,
    avoid: useDefaults ? "" : $(`inp-${pk}-avoid`).value.trim(),
    model: keepModel(pk),
  });
  state.players = { p1: mk("p1", "משתתף/ת 1"), p2: mk("p2", "משתתף/ת 2") };
  if (!useDefaults) {
    state.settings.driver = $("inp-driver").value;
    state.settings.transitionsFreq = $("inp-transitions").value;
    state.settings.intimacy = $("inp-intimacy").value === "on";
    state.settings.intimacyLevel = $("inp-intimacy-level").value;
    state.apiKey = $("inp-apikey").value.trim();
  }
  saveState();
  renderMenu();
}

$("btn-start").onclick = () => collectSetup(false);
$("btn-skip-setup").onclick = () => {
  collectSetup(true);
  toast("מתחילים מיד — נלמד את ההעדפות שלכם תוך כדי משחק 🚀");
};

$("btn-quit").onclick = () => {
  if (round && !round.isTiebreak && round.idx < round.questions.length) {
    state.savedRound = serializeRound(round);
  }
  round = null;
  saveState();
  renderMenu();
};
$("btn-menu").onclick = () => renderMenu();
$("btn-resume").onclick = () => startRound({ resume: true });
$("btn-discard-resume").onclick = () => { state.savedRound = null; saveState(); renderMenu(); };

$("btn-tts").onclick = () => {
  state.settings.tts = !state.settings.tts;
  $("btn-tts").textContent = state.settings.tts ? "🔊" : "🔇";
  toast(state.settings.tts ? "הקראה קולית פעילה 🔊" : "הקראה קולית כבויה 🔇");
  if (state.settings.tts) speak("ההקראה הקולית פעילה. נהיגה בטוחה!");
  saveState();
};

/* כפתורי מצב בתפריט */
document.querySelectorAll("#scoring-chips .chip").forEach(c => c.onclick = () => {
  state.settings.scoring = c.dataset.scoring;
  saveState();
  renderMenu();
  toast(c.dataset.scoring === "coop" ? "מצב שיתופי — אתם יחד מול המשחק 🤝" : "מצב תחרותי 🏆");
});
document.querySelectorAll("#length-chips .chip").forEach(c => c.onclick = () => {
  state.settings.length = c.dataset.len;
  saveState();
  renderMenu();
});

/* מצב למבוגרים — אישור שני המשתתפים */
function openAdultDialog() {
  $("adult-name-1").textContent = `${pName("p1")} מאשר/ת`;
  $("adult-name-2").textContent = `${pName("p2")} מאשר/ת`;
  $("adult-ok-1").checked = false;
  $("adult-ok-2").checked = false;
  $("adult-go").disabled = true;
  $("dlg-adult").showModal();
}
["adult-ok-1", "adult-ok-2"].forEach(id => $(id).onchange = () => {
  $("adult-go").disabled = !($("adult-ok-1").checked && $("adult-ok-2").checked);
});
$("adult-go").onclick = () => { $("dlg-adult").close(); startRound({ modeKey: "adult" }); };
$("adult-cancel").onclick = () => $("dlg-adult").close();

/* הגדרות */
$("btn-settings").onclick = () => {
  $("set-apikey").value = state.apiKey;
  $("set-tts").checked = state.settings.tts;
  $("set-grounding").checked = state.settings.grounding;
  $("set-transitions").value = state.settings.transitionsFreq;
  $("dlg-settings").showModal();
};
$("set-save").onclick = () => {
  state.apiKey = $("set-apikey").value.trim();
  state.settings.tts = $("set-tts").checked;
  state.settings.grounding = $("set-grounding").checked;
  state.settings.transitionsFreq = $("set-transitions").value;
  saveState();
  $("dlg-settings").close();
  renderMenu();
  toast("נשמר ✅");
};
$("set-close").onclick = () => $("dlg-settings").close();
$("set-profile").onclick = () => { $("dlg-settings").close(); fillSetupForm(); show("screen-setup"); };
$("set-reset").onclick = () => {
  if (!confirm("לאפס את הניקוד המצטבר?")) return;
  state.scores = { p1: 0, p2: 0, team: 0 };
  state.usedPrizes = [];
  state.roundsPlayed = 0;
  saveState();
  $("dlg-settings").close();
  renderMenu();
  toast("הניקוד אופס — יאללה מחדש! 🔄");
};

/* מסך הלמידה */
$("btn-learned").onclick = openLearnedDialog;
$("learn-close").onclick = () => $("dlg-learned").close();
$("learn-enabled").onchange = () => {
  state.settings.learningEnabled = $("learn-enabled").checked;
  saveState();
  toast(state.settings.learningEnabled ? "למידה פעילה 🧠" : "הלמידה כבויה — המשחק לא ישמור העדפות חדשות");
};
$("learn-reset").onclick = () => {
  if (!confirm("לאפס את כל מה שהמשחק למד? (השמות והפרופילים יישארו)")) return;
  Learn.resetAll();
  toast("הלמידה אופסה — מתחילים להכיר אתכם מחדש 🧠");
  openLearnedDialog();
};
$("learn-wipe").onclick = () => {
  if (!confirm("למחוק את כל הנתונים לצמיתות? (פרופילים, ניקוד, למידה, היסטוריה)")) return;
  localStorage.removeItem(LS_KEY);
  localStorage.removeItem(LS_KEY_V1);
  location.reload();
};

/* ---------- הפעלה ---------- */
loadState();
$("btn-tts").textContent = state.settings.tts ? "🔊" : "🔇";
if (state.players) {
  fillSetupForm();
  renderMenu();
} else {
  updateDriverLabels();
  show("screen-setup");
}
