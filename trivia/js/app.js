/* ===== טריוויה בדרכים — מנוע המשחק ===== */

const LS_KEY = "roadtrivia_v1";

const GAME_TYPES = {
  head2head: { name: "ראש בראש", icon: "🥊", desc: "כל אחד בתורו מקבל שאלת טריוויה. תשובה נכונה = נקודה." },
  closest:   { name: "הכי קרוב מנצח", icon: "📏", desc: "שאלות מספריות. מי שקרוב יותר לתשובה לוקח את הנקודה." },
  truefalse: { name: "נכון או לא נכון", icon: "⚖️", desc: "עובדות מפתיעות. כל אחד מחליט — נכון או פייק?" },
  clues:     { name: "שלושה רמזים", icon: "🕵️", desc: "רמז ראשון = 3 נק', שני = 2, שלישי = 1. מי מזהה קודם?" },
  choice:    { name: "אני יודע/ת מה תבחר/י", icon: "💘", desc: "שתי אפשרויות — צריך לנחש במה בן/בת הזוג יבחרו." },
  knowme:    { name: "מי מכיר את מי?", icon: "🧠", desc: "שאלות אישיות — מי מכיר את השני טוב יותר?" },
  hot:       { name: "חם, חם יותר", icon: "🔥", desc: "משחקון זוגי אינטימי, ברמה שבחרתם. אפשר לומר 'עוברים' תמיד." },
};

const QUESTIONS_PER_ROUND = 5;

/* ---------- מצב המשחק ---------- */
let state = {
  profile: null,
  apiKey: "",
  tts: false,
  scores: { p1: 0, p2: 0 },          // ניקוד מצטבר לכל הנסיעה
  usedQuestions: [],                  // טקסטים של שאלות שכבר נשאלו (למניעת חזרות)
  usedPrizes: [],
  roundsPlayed: 0,
};

let round = null; // { type, questions, idx, roundScores, clueStage, firstTarget }

/* ---------- עזרים ---------- */
const $ = (id) => document.getElementById(id);
const show = (id) => { document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden")); $(id).classList.remove("hidden"); };

function toast(msg, ms = 3500) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add("hidden"), ms);
}

function saveState() {
  localStorage.setItem(LS_KEY, JSON.stringify({
    profile: state.profile, apiKey: state.apiKey, tts: state.tts,
    scores: state.scores, usedQuestions: state.usedQuestions.slice(-200),
    usedPrizes: state.usedPrizes, roundsPlayed: state.roundsPlayed,
  }));
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY));
    if (saved && saved.profile) Object.assign(state, saved);
  } catch (e) { /* מצב חדש */ }
}

function speak(text) {
  if (!state.tts || !("speechSynthesis" in window)) return;
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

function pName(key) { return key === "p1" ? state.profile.p1 : state.profile.p2; }
function otherP(key) { return key === "p1" ? "p2" : "p1"; }

/* ---------- מחולל שאלות AI ---------- */

const AI_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          answer: { type: "string" },
          fact: { type: "string" },
          category: { type: "string" },
          clues: { type: "array", items: { type: "string" } },
          options: { type: "array", items: { type: "string" } },
        },
        required: ["question", "answer", "fact", "category", "clues", "options"],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
};

function buildSystemPrompt() {
  const p = state.profile;
  const intimacyLevels = { flirty: "פלרטטנית ועדינה", personal: "אישית עד נועזת, באלגנטיות", daring: "נועזת אך מכבדת" };
  return `אתה מחולל שאלות למשחק טריוויה זוגי שמשוחק בקול בזמן נסיעה ברכב.
המשתתפים: ${p.p1} ו${p.p2}, זוג נשוי, יחד ${p.years} שנים. שניהם בגירים.

כללים מחייבים:
- כל השאלות בעברית טבעית, קלילה ומשעשעת, מנוסחות להאזנה (משפטים קצרים).
- נושאים אהובים: ${p.topics}.
- נושאים אסורים: ${p.avoid}. לעולם אל תיצור שאלות בנושאים אלה.
- רמת קושי: ${p.difficulty === "light" ? "קלילה" : p.difficulty === "hard" ? "מאתגרת" : "מגוונת — בין קל לבינוני, לא מאתגרת מדי"}.
- לכל שאלת טריוויה חייבת להיות תשובה עובדתית אחת ברורה ומאומתת. אם אינך בטוח בעובדה — אל תשתמש בה.
- בלי שאלות טריק ובלי ניסוחים עמומים.
- לא יותר משאלת גיאוגרפיה אחת בכל חבילה.
- גוון בין קטגוריות — אל תחזור על אותה קטגוריה פעמיים ברצף.
- שדה fact: עובדה קצרה ומפתיעה שקשורה לתשובה.
- שאלות אינטימיות (אם יתבקשו): ברמה ${intimacyLevels[p.intimacyLevel] || "אישית"}, בטון משחקי ומכבד, בלי לחץ ובלי להפוך תשובות למבחן של הקשר. בלי עידוד מגע בזמן נהיגה.
- שדות שאינם רלוונטיים לסוג השאלה: החזר מחרוזת ריקה או מערך ריק.`;
}

function buildUserPrompt(type, count) {
  const recent = state.usedQuestions.slice(-60);
  const avoidBlock = recent.length
    ? `\n\nאל תחזור על שאלות דומות לאלה שכבר נשאלו:\n- ${recent.join("\n- ")}`
    : "";

  const perType = {
    head2head: `צור ${count} שאלות טריוויה קלאסיות (שאלה + תשובה עובדתית קצרה + עובדה מעניינת). השאירו clues ו-options ריקים.`,
    closest: `צור ${count} שאלות אומדן מספריות — התשובה חייבת להיות מספר או ערך מספרי מנוסח בקצרה (למשל "8,849 מטר"). השאירו clues ו-options ריקים.`,
    truefalse: `צור ${count} עובדות מפתיעות. בשדה question כתוב את הטענה, בשדה answer כתוב בדיוק "נכון ✅" או "לא נכון ❌", ובשדה fact הסבר קצר. חלק מהטענות נכונות וחלק שגויות — ערבב. השאירו clues ו-options ריקים.`,
    clues: `צור ${count} חידות זיהוי: בשדה answer מי/מה מזהים (אדם, מקום, מותג, להקה...), בשדה clues בדיוק 3 רמזים מהקשה לקל (הראשון קשה, השלישי כמעט מסגיר), בשדה fact עובדה מעניינת. את שדה question השאר ריק. השאירו options ריק.`,
    choice: `צור ${count} דילמות "מה תבחר/י": בשדה options בדיוק 2 אפשרויות מפתות ומנוגדות (העדפות חיים, בילויים, אוכל, סגנון). השאירו question, answer, fact ריקים (answer = "").`,
    knowme: `צור ${count} שאלות "מי מכיר את מי" — שאלות על ההעדפות/הרגלים של בן/בת הזוג. השתמש במחרוזת {partner} במקום השם. למשל: "מה המאכל שהכי משמח את {partner}?". השאירו answer, fact, clues, options ריקים.`,
    hot: `צור ${count} שאלות זוגיות אינטימיות ברמה שהוגדרה — שאלות שיחה פתוחות, רומנטיות, מסקרנות ומכבדות על הקשר, המשיכה והזוגיות. בלי צורך בתשובה עובדתית. השאירו answer, fact, clues, options ריקים.`,
  };

  return perType[type] + avoidBlock;
}

async function generateAIQuestions(type, count) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": state.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-opus-4-8",
      max_tokens: 4096,
      system: buildSystemPrompt(),
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: AI_SCHEMA },
      },
      messages: [{ role: "user", content: buildUserPrompt(type, count) }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `שגיאת API (${res.status})`);
  }

  const data = await res.json();
  if (data.stop_reason === "refusal") throw new Error("Claude סירב לבקשה הזו");
  const text = data.content.find(b => b.type === "text")?.text || "{}";
  const parsed = JSON.parse(text);
  if (!parsed.questions?.length) throw new Error("לא התקבלו שאלות");
  return parsed.questions;
}

/* ---------- שליפת שאלות (AI עם נפילה למאגר) ---------- */

function getFallbackQuestions(type, count) {
  const bank = FALLBACK_BANK[type] || [];
  const keyOf = (q) => q.question || q.answer || (q.options || []).join("|");
  let fresh = bank.filter(q => !state.usedQuestions.includes(keyOf(q)));
  if (fresh.length < count) fresh = bank; // המאגר נגמר — מתחילים סבב חדש
  return shuffle(fresh).slice(0, count);
}

async function getQuestions(type, count) {
  if (state.apiKey) {
    try {
      return await generateAIQuestions(type, count);
    } catch (e) {
      console.warn("AI generation failed:", e);
      toast(`⚠️ בעיה במחולל ה-AI (${e.message}) — עוברים למאגר המובנה`);
    }
  }
  return getFallbackQuestions(type, count);
}

/* ---------- זרימת המשחק ---------- */

function renderScores() {
  const html = `<span class="p1">${state.profile.p1}: ${state.scores.p1 + (round?.roundScores.p1 || 0)}</span>
    <span>|</span>
    <span class="p2">${state.profile.p2}: ${state.scores.p2 + (round?.roundScores.p2 || 0)}</span>`;
  $("scorebox-menu").innerHTML = html;
  const g = $("scorebox-game");
  if (g) g.innerHTML = html;
}

function renderMenu() {
  renderScores();
  const p = state.profile;
  const driver = p.driver === "none" ? null : pName(p.driver);
  $("menu-greeting").textContent = driver
    ? `${driver} על ההגה 🚗 — עיניים לכביש! ${pName(otherP(p.driver))} מתפעל/ת את המשחק.`
    : `${p.p1} ו${p.p2} — מוכנים לקרב? 😏`;

  const grid = $("game-grid");
  grid.innerHTML = "";
  Object.entries(GAME_TYPES).forEach(([key, g]) => {
    if (key === "hot" && !p.intimacy) return;
    const card = document.createElement("div");
    card.className = "game-card" + (key === "hot" ? " hot" : "");
    card.innerHTML = `<span class="g-icon">${g.icon}</span><span class="g-name">${g.name}</span><span class="g-desc">${g.desc}</span>`;
    card.onclick = () => startRound(key);
    grid.appendChild(card);
  });

  $("ai-status").textContent = state.apiKey
    ? "🤖 מאגר אינסופי פעיל — Claude יוצר שאלות חדשות בכל סבב"
    : "📚 משחקים מהמאגר המובנה. הוסיפו מפתח API בהגדרות למאגר אינסופי.";
  show("screen-menu");
}

async function startRound(type) {
  $("loading-text").textContent = state.apiKey
    ? "Claude רוקח שאלות טריות בשבילכם... 🧪"
    : "מערבבים את הקלפים... 🃏";
  $("loading").classList.remove("hidden");

  const questions = await getQuestions(type, QUESTIONS_PER_ROUND);
  $("loading").classList.add("hidden");

  round = {
    type,
    origType: type,
    questions,
    idx: 0,
    roundScores: { p1: 0, p2: 0 },
    clueStage: 0,
    // מתחלפים מי מתחיל בכל סבב
    firstTarget: state.roundsPlayed % 2 === 0 ? "p1" : "p2",
    isTiebreak: false,
  };
  show("screen-game");
  renderQuestion();
}

function currentTarget() {
  // מתחלפים כל שאלה; הנהג/ת לא מקבל/ת משימות מיוחדות אבל כן שאלות
  return (round.idx % 2 === 0) ? round.firstTarget : otherP(round.firstTarget);
}

function markUsed(q) {
  const key = q.question || q.answer || (q.options || []).join("|");
  if (key && !state.usedQuestions.includes(key)) state.usedQuestions.push(key);
}

function renderQuestion() {
  const q = round.questions[round.idx];
  const type = round.type;
  const g = GAME_TYPES[type];
  markUsed(q);
  renderScores();

  $("game-type-badge").textContent = `${g.icon} ${g.name}`;
  $("q-counter").textContent = round.isTiebreak
    ? "⚡ שובר שוויון!"
    : `שאלה ${round.idx + 1} מתוך ${round.questions.length}`;

  // איפוס תצוגה
  ["q-clues", "q-options", "q-answer", "q-fact"].forEach(id => {
    $(id).classList.add("hidden");
    $(id).innerHTML = "";
  });
  round.clueStage = 0;

  const target = currentTarget();
  const targetName = pName(target);
  const partnerName = pName(otherP(target));
  const actions = $("game-actions");
  actions.innerHTML = "";

  let questionText = (q.question || "").replaceAll("{partner}", partnerName);
  let speakText = "";

  switch (type) {
    case "head2head": {
      $("q-target").textContent = `🎯 התור של ${targetName}`;
      $("q-category").textContent = q.category || "";
      $("q-text").textContent = questionText;
      speakText = `${targetName}, ${questionText}`;
      addRevealFlow(actions, q, target);
      break;
    }
    case "closest": {
      $("q-target").textContent = "📏 שניכם עונים — הכי קרוב מנצח";
      $("q-category").textContent = q.category || "";
      $("q-text").textContent = questionText;
      speakText = questionText + ". שניכם, תגידו מספר!";
      addBtn(actions, "חשיפת התשובה 👀", "warn wide", () => {
        revealAnswer(q);
        actions.innerHTML = "";
        addBtn(actions, `${state.profile.p1} קרוב יותר ✅`, "primary", () => scoreAndNext({ p1: 1 }));
        addBtn(actions, `${state.profile.p2} קרובה יותר ✅`, "warn", () => scoreAndNext({ p2: 1 }));
        addBtn(actions, "תיקו מפתיע 🤝 (נקודה לשניים)", "wide", () => scoreAndNext({ p1: 1, p2: 1 }));
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
        actions.innerHTML = "";
        addBtn(actions, `${state.profile.p1} צדק ✅`, "primary", () => scoreAndNext({ p1: 1 }));
        addBtn(actions, `${state.profile.p2} צדקה ✅`, "warn", () => scoreAndNext({ p2: 1 }));
        addBtn(actions, "שניהם צדקו 🎉", "", () => scoreAndNext({ p1: 1, p2: 1 }));
        addBtn(actions, "אף אחד 😅", "", () => scoreAndNext({}));
      });
      break;
    }
    case "clues": {
      $("q-target").textContent = `🕵️ התור של ${targetName} לזהות`;
      $("q-category").textContent = q.category || "";
      $("q-text").textContent = "מי או מה אני?";
      $("q-clues").classList.remove("hidden");
      showClue(q, 0);
      speakText = `${targetName}, מי או מה אני? רמז ראשון: ${q.clues?.[0] || ""}`;
      renderClueActions(q, target);
      break;
    }
    case "choice": {
      $("q-target").textContent = `💘 ${targetName} מנחש/ת מה ${partnerName} בוחר/ת`;
      $("q-category").textContent = "";
      $("q-text").textContent = `${partnerName} — תחליט/י בלב. ${targetName} — נחש/י בקול!`;
      $("q-options").classList.remove("hidden");
      (q.options || []).forEach(opt => {
        const d = document.createElement("div");
        d.className = "opt";
        d.textContent = opt;
        $("q-options").appendChild(d);
      });
      speakText = `${partnerName}, תבחרי בלב: ${(q.options || []).join(", או ")}. ${targetName}, מה הניחוש שלך?`;
      addBtn(actions, "ניחוש נכון! 🎯 (נקודה)", "primary wide", () => scoreAndNext({ [target]: 1 }));
      addBtn(actions, "פספוס 😅", "wide", () => scoreAndNext({}));
      break;
    }
    case "knowme": {
      $("q-target").textContent = `🧠 ${targetName} עונה על ${partnerName}. ${partnerName} שופט/ת!`;
      $("q-category").textContent = "";
      $("q-text").textContent = questionText;
      speakText = `${targetName}: ${questionText}`;
      addBtn(actions, "קלע/ה בול! 🎯 (נקודה)", "primary wide", () => scoreAndNext({ [target]: 1 }));
      addBtn(actions, "קרוב אבל לא 😅", "wide", () => scoreAndNext({}));
      break;
    }
    case "hot": {
      $("q-target").textContent = `🔥 שאלה ל${targetName} — ואפשר תמיד לומר "עוברים"`;
      $("q-category").textContent = "";
      $("q-text").textContent = questionText;
      speakText = `${targetName}: ${questionText}`;
      addBtn(actions, "ענה/תה בכנות ❤️ (נקודה)", "pink wide", () => scoreAndNext({ [target]: 1 }));
      addBtn(actions, "עוברים 🙈 (בלי לאבד נקודות)", "wide", () => scoreAndNext({}));
      break;
    }
  }

  speak(speakText);
}

/* חשיפת תשובה + עובדה */
function revealAnswer(q) {
  if (q.answer) {
    $("q-answer").textContent = q.answer;
    $("q-answer").classList.remove("hidden");
  }
  if (q.fact) {
    $("q-fact").textContent = q.fact;
    $("q-fact").classList.remove("hidden");
  }
  speak(`התשובה: ${q.answer || ""}. ${q.fact || ""}`);
}

/* זרימת "חשוף תשובה → נכון/לא נכון" (ראש בראש) */
function addRevealFlow(actions, q, target) {
  addBtn(actions, "חשיפת התשובה 👀", "warn wide", () => {
    revealAnswer(q);
    actions.innerHTML = "";
    addBtn(actions, "תשובה נכונה! ✅ (נקודה)", "primary wide", () => scoreAndNext({ [target]: 1 }));
    addBtn(actions, "לא נכון 😅", "wide", () => scoreAndNext({}));
  });
}

/* משחקון הרמזים */
function showClue(q, stage) {
  const pts = [3, 2, 1][stage];
  const div = document.createElement("div");
  div.className = "clue";
  div.innerHTML = `<span class="pts">רמז ${stage + 1} · שווה ${pts} נק'</span><br>${q.clues?.[stage] || ""}`;
  $("q-clues").appendChild(div);
}

function renderClueActions(q, target) {
  const actions = $("game-actions");
  actions.innerHTML = "";
  const pts = [3, 2, 1][round.clueStage];
  addBtn(actions, `זיהוי נכון! 🎯 (+${pts} נק')`, "primary wide", () => {
    revealAnswer(q);
    setTimeout(() => scoreAndNext({ [target]: pts }), 1600);
  });
  if (round.clueStage < 2) {
    addBtn(actions, "רמז נוסף בבקשה 🙏", "warn wide", () => {
      round.clueStage++;
      showClue(q, round.clueStage);
      speak(q.clues?.[round.clueStage] || "");
      renderClueActions(q, target);
    });
  } else {
    addBtn(actions, "נכנעים 🏳️ — מה התשובה?", "wide", () => {
      revealAnswer(q);
      actions.innerHTML = "";
      addBtn(actions, "לשאלה הבאה ⬅️", "primary wide", () => scoreAndNext({}));
    });
  }
}

function addBtn(parent, text, cls, onclick) {
  const b = document.createElement("button");
  b.className = "btn " + cls;
  b.textContent = text;
  b.onclick = onclick;
  parent.appendChild(b);
}

/* ניקוד ומעבר */
function scoreAndNext(points) {
  if (points.p1) round.roundScores.p1 += points.p1;
  if (points.p2) round.roundScores.p2 += points.p2;
  renderScores();

  round.idx++;
  if (round.idx < round.questions.length) {
    renderQuestion();
  } else if (round.roundScores.p1 === round.roundScores.p2 && !round.isTiebreak) {
    startTiebreak();
  } else {
    endRound();
  }
}

function startTiebreak() {
  const tb = shuffle(TIEBREAKERS.filter(t => !state.usedQuestions.includes(t.question)));
  const q = tb[0] || TIEBREAKERS[Math.floor(Math.random() * TIEBREAKERS.length)];
  round.isTiebreak = true;
  round.questions.push(q);
  toast("⚡ תיקו! שאלת שובר שוויון — הכי קרוב לוקח את הסבב");
  // שובר שוויון: שניהם עונים, הכי קרוב מנצח
  round.type = "closest";
  renderQuestion();
}

/* סיום סבב */
function endRound() {
  const rs = round.roundScores;
  state.scores.p1 += rs.p1;
  state.scores.p2 += rs.p2;
  state.roundsPlayed++;

  let winner = null;
  if (rs.p1 > rs.p2) winner = "p1";
  else if (rs.p2 > rs.p1) winner = "p2";

  $("result-emoji").textContent = winner ? "🏆" : "🤝";
  $("result-title").textContent = winner
    ? `${pName(winner)} לוקח/ת את הסבב!`
    : "תיקו אמיתי — שניכם אלופים!";
  $("result-score").textContent =
    `${state.profile.p1} ${rs.p1} — ${rs.p2} ${state.profile.p2}   |   סה"כ בנסיעה: ${state.scores.p1} — ${state.scores.p2}`;

  // פרס אקראי שלא חזר על עצמו
  let available = PRIZES.filter(p => !state.usedPrizes.includes(p));
  if (!available.length) { state.usedPrizes = []; available = PRIZES; }
  const prize = available[Math.floor(Math.random() * available.length)];
  state.usedPrizes.push(prize);
  $("result-prize").textContent = prize;

  saveState();
  const lastType = round.origType || round.type;
  round = null;
  $("btn-again").onclick = () => startRound(lastType);
  show("screen-result");
  speak(`${winner ? pName(winner) + " ניצח את הסבב!" : "תיקו!"} ${prize}`);
}

/* ---------- אתחול ואירועים ---------- */

function initSetupForm() {
  const p = state.profile;
  if (!p) return;
  $("inp-p1").value = p.p1;
  $("inp-p2").value = p.p2;
  $("inp-driver").value = p.driver;
  $("inp-years").value = p.years;
  $("inp-topics").value = p.topics;
  $("inp-avoid").value = p.avoid;
  $("inp-difficulty").value = p.difficulty;
  $("inp-intimacy").value = p.intimacy ? "on" : "off";
  $("inp-intimacy-level").value = p.intimacyLevel;
  $("inp-apikey").value = state.apiKey;
}

$("btn-start").onclick = () => {
  state.profile = {
    p1: $("inp-p1").value.trim() || "משתתף 1",
    p2: $("inp-p2").value.trim() || "משתתף 2",
    driver: $("inp-driver").value,
    years: +$("inp-years").value || 0,
    topics: $("inp-topics").value.trim(),
    avoid: $("inp-avoid").value.trim(),
    difficulty: $("inp-difficulty").value,
    intimacy: $("inp-intimacy").value === "on",
    intimacyLevel: $("inp-intimacy-level").value,
  };
  state.apiKey = $("inp-apikey").value.trim();
  saveState();
  renderMenu();
};

$("btn-quit").onclick = () => { round = null; renderMenu(); };
$("btn-menu").onclick = () => renderMenu();

$("btn-tts").onclick = () => {
  state.tts = !state.tts;
  $("btn-tts").textContent = state.tts ? "🔊" : "🔇";
  toast(state.tts ? "הקראה קולית פעילה 🔊" : "הקראה קולית כבויה 🔇");
  if (state.tts) speak("ההקראה הקולית פעילה. נהיגה בטוחה!");
  saveState();
};

/* הגדרות */
$("btn-settings").onclick = () => {
  $("set-apikey").value = state.apiKey;
  $("set-tts").checked = state.tts;
  $("dlg-settings").showModal();
};
$("set-save").onclick = () => {
  state.apiKey = $("set-apikey").value.trim();
  state.tts = $("set-tts").checked;
  saveState();
  $("dlg-settings").close();
  renderMenu();
  toast("נשמר ✅");
};
$("set-close").onclick = () => $("dlg-settings").close();
$("set-reset").onclick = () => {
  if (!confirm("לאפס את כל הניקוד וההיסטוריה?")) return;
  state.scores = { p1: 0, p2: 0 };
  state.usedQuestions = [];
  state.usedPrizes = [];
  state.roundsPlayed = 0;
  saveState();
  $("dlg-settings").close();
  renderMenu();
  toast("המשחק אופס — יאללה מחדש! 🔄");
};

/* הפעלה */
loadState();
$("btn-tts").textContent = state.tts ? "🔊" : "🔇";
if (state.profile) {
  initSetupForm();
  renderMenu();
} else {
  show("screen-setup");
}
