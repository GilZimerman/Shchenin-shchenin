/* ===== מנוע התוכן =====
   בחירת שאלות: מאגר מובנה + מאגר AI מקומי (תור לא-מקוון) + יצירה חיה,
   עם מזהים ייחודיים, מניעת חזרות, סינון נושאים חסומים ובניית סיבובים מעורבים. */

const Engine = {

  REPEAT_COOLDOWN_MS: 72 * 3600 * 1000,

  /* מזהה יציב לשאלה — מונע כפילויות גם בין מקורות */
  qid(q) {
    const key = (q.question || "") + "|" + (q.answer || "") + "|" + (q.options || []).join("|");
    let h = 0;
    for (let i = 0; i < key.length; i++) { h = ((h << 5) - h + key.charCodeAt(i)) | 0; }
    return "q" + Math.abs(h).toString(36);
  },

  wasShownRecently(q) {
    const ts = state.shownIds[Engine.qid(q)];
    return ts && (Date.now() - ts < Engine.REPEAT_COOLDOWN_MS);
  },

  markShown(q) {
    state.shownIds[Engine.qid(q)] = Date.now();
    // גיזום רשומות ישנות
    const ids = Object.entries(state.shownIds);
    if (ids.length > 400) {
      state.shownIds = Object.fromEntries(ids.sort((a, b) => b[1] - a[1]).slice(0, 300));
    }
  },

  isBlocked(q) {
    const blocked = Learn.blockedAll();
    if (!blocked.length) return false;
    const text = [(q.category || ""), (q.question || "")].join(" ");
    return blocked.some(t => t && text.includes(t));
  },

  /* --- תור התוכן המקומי (שאלות AI שאושרו, לשימוש חוזר וללא-רשת) --- */
  poolGet(qtype) { return (state.aiPool[qtype] || []); },

  poolAdd(qtype, questions) {
    const pool = state.aiPool[qtype] || [];
    const seen = new Set(pool.map(Engine.qid));
    questions.forEach(q => { if (!seen.has(Engine.qid(q))) pool.push(q); });
    state.aiPool[qtype] = pool.slice(-40); // שומרים עד 40 לכל סוג
    saveState();
  },

  poolTake(qtype, n) {
    const fresh = Engine.poolGet(qtype).filter(q => !Engine.wasShownRecently(q) && !Engine.isBlocked(q));
    return shuffle(fresh).slice(0, n);
  },

  /* --- שליפה מהמאגר המובנה --- */
  fromBank(qtype, n, exclude) {
    const bank = FALLBACK_BANK[qtype] || [];
    const excludeIds = new Set((exclude || []).map(Engine.qid));
    let fresh = bank.filter(q => !Engine.wasShownRecently(q) && !Engine.isBlocked(q) && !excludeIds.has(Engine.qid(q)));
    if (fresh.length < n) fresh = bank.filter(q => !Engine.isBlocked(q) && !excludeIds.has(Engine.qid(q)));
    if (fresh.length < n) fresh = bank;
    return shuffle(fresh).slice(0, n);
  },

  /* שליפת n פריטים מסוג — קודם תור AI, אחר כך מאגר */
  take(qtype, n) {
    const fromPool = Engine.poolTake(qtype, n);
    if (fromPool.length < n) {
      fromPool.push(...Engine.fromBank(qtype, n - fromPool.length, fromPool));
    }
    // הוצאה מהתור כדי שלא יחזרו
    state.aiPool[qtype] = Engine.poolGet(qtype).filter(q => !fromPool.some(p => Engine.qid(p) === Engine.qid(q)));
    return fromPool.slice(0, n).map(q => Object.assign({ qtype }, q));
  },

  /* --- הרכבי מצבי משחק --- */
  /* mix: רשימת [qtype, משקל] — הסיבוב נבנה מהם לפי המשקלים והלמידה */
  MODES: {
    quick:    { name: "מהיר ⚡", len: 5, mix: null },  // null = ערבוב חכם
    smart:    { name: "ערבוב חכם 🎲", len: 8, mix: null },
    surprise: { name: "הפתיעו אותנו 🎁", len: 7, mix: "random" },
    know:     { name: "כמה אתם מכירים? 💞", len: 6, mix: [["knowme", 3], ["choice", 2], ["hot", 1]] },
    triviaOnly: { name: "טריוויה בלבד 🎓", len: 8, mix: [["head2head", 3], ["closest", 2], ["truefalse", 2], ["clues", 1]] },
    personalOnly: { name: "אישי בלבד 💬", len: 6, mix: [["knowme", 2], ["choice", 2], ["hot", 2]] },
    adult:    { name: "למבוגרים 🔞", len: 6, mix: [["hot", 4], ["choice", 1], ["knowme", 1]] },
  },

  LENGTHS: { short: 5, medium: 8, long: 12 },

  /* ערבוב חכם: משקל לכל סוג לפי שימוש, העדפות ולמידה */
  smartMix() {
    const factual = ["head2head", "closest", "truefalse", "clues"];
    const personal = ["knowme", "choice"];
    const weights = {};
    [...factual, ...personal].forEach(t => {
      const use = (Learn.model("p1").typeUse[t] || 0) + (Learn.model("p2").typeUse[t] || 0);
      weights[t] = 1 + Math.min(1.5, use * 0.1); // סוגים ששוחקו ואהובים מקבלים דחיפה קלה
    });
    if (state.settings.intimacy) weights.hot = 0.6;
    return Object.entries(weights);
  },

  /* בניית רשימת סוגים לסיבוב */
  buildTypeList(modeKey, length) {
    const mode = Engine.MODES[modeKey];
    let len = length || (mode ? mode.len : 5);
    let mix = mode ? mode.mix : null;

    let entries;
    if (mix === "random") {
      const all = ["head2head", "closest", "truefalse", "clues", "knowme", "choice"];
      if (state.settings.intimacy) all.push("hot");
      entries = all.map(t => [t, 1]);
    } else if (Array.isArray(mix)) {
      entries = mix.filter(([t]) => t !== "hot" || state.settings.intimacy);
    } else {
      entries = Engine.smartMix();
    }

    const total = entries.reduce((a, [, w]) => a + w, 0);
    const types = [];
    entries.forEach(([t, w]) => {
      for (let i = 0; i < Math.round(len * w / total); i++) types.push(t);
    });
    while (types.length < len) types.push(entries[Math.floor(Math.random() * entries.length)][0]);
    // ערבוב שמונע שלוש פעמים אותו סוג ברצף
    let arr = shuffle(types).slice(0, len);
    for (let i = 2; i < arr.length; i++) {
      if (arr[i] === arr[i - 1] && arr[i] === arr[i - 2]) {
        const j = arr.findIndex((t, k) => k > i && t !== arr[i]);
        if (j > 0) [arr[i], arr[j]] = [arr[j], arr[i]];
      }
    }
    return arr;
  },

  /* בניית סיבוב שלם (מעורב או חד-סוגי) */
  buildRound(modeKey, singleType, length) {
    let types;
    if (singleType) {
      types = Array(length || QUESTIONS_PER_ROUND).fill(singleType);
    } else {
      types = Engine.buildTypeList(modeKey, length);
    }
    const counts = {};
    types.forEach(t => counts[t] = (counts[t] || 0) + 1);
    const perType = {};
    Object.entries(counts).forEach(([t, n]) => { perType[t] = Engine.take(t, n); });
    return types.map(t => perType[t].shift()).filter(Boolean);
  },
};
