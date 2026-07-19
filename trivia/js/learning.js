/* ===== מנוע למידה והתאמה אישית =====
   מנוע היברידי מבוסס חוקים ומשקלים, עם צבירת אותות ומדד ביטחון.
   בנוי כשכבה נפרדת — ניתן להחליף בעתיד במודל המלצות בלי לגעת בשאר האפליקציה. */

const Learn = {

  /* מודל שחקן ריק */
  emptyModel() {
    return {
      categories: {},      // cat -> {shown, correct, wrong, skipped, liked, disliked, more}
      diffScore: 2.0,      // רמת קושי רציפה: 1 קל ... 3 קשה
      recent: [],          // חלון הצלחות אחרון (1/0), עד 8
      answerMsTotal: 0,
      answers: 0,
      blockedTopics: [],   // נושאים שהמשתתפים ביקשו להוריד
      typeUse: {},         // qtype -> כמה פעמים שוחק
      feedbackLog: [],     // 30 אחרונים: {kind, category, ts}
      updatedAt: 0,
    };
  },

  model(pk) {
    const pl = state.players[pk];
    if (!pl.model) pl.model = Learn.emptyModel();
    return pl.model;
  },

  cat(m, category) {
    const c = category || "כללי";
    if (!m.categories[c]) m.categories[c] = { shown: 0, correct: 0, wrong: 0, skipped: 0, liked: 0, disliked: 0, more: 0 };
    return m.categories[c];
  },

  /* --- קליטת אותות משחק --- */
  record(pk, { category, correct, skipped, ms, qtype }) {
    if (!state.settings.learningEnabled) return;
    const m = Learn.model(pk);
    const c = Learn.cat(m, category);
    c.shown++;
    if (skipped) c.skipped++;
    else if (correct === true) { c.correct++; m.recent.push(1); }
    else if (correct === false) { c.wrong++; m.recent.push(0); }
    m.recent = m.recent.slice(-8);
    if (ms && ms > 300 && ms < 180000) { m.answerMsTotal += ms; m.answers++; }
    if (qtype) m.typeUse[qtype] = (m.typeUse[qtype] || 0) + 1;
    m.updatedAt = Date.now();
    Learn.adjustDifficulty(m);
    saveState();
  },

  /* התאמת קושי הדרגתית: חלון של 6+ תשובות, צעדים קטנים, בלי קפיצות */
  adjustDifficulty(m) {
    if (m.recent.length < 6) return;
    const rate = m.recent.reduce((a, b) => a + b, 0) / m.recent.length;
    if (rate >= 0.8 && m.diffScore < 3) m.diffScore = Math.min(3, m.diffScore + 0.25);
    else if (rate <= 0.3 && m.diffScore > 1) m.diffScore = Math.max(1, m.diffScore - 0.25);
  },

  /* --- משוב מפורש: אהבנו / פחות / קשה / קל / עוד / חסימת נושא --- */
  feedback(pk, kind, category) {
    if (!state.settings.learningEnabled && kind !== "block") return;
    const m = Learn.model(pk);
    const c = Learn.cat(m, category);
    if (kind === "like") c.liked++;
    else if (kind === "less") c.disliked++;
    else if (kind === "more") c.more += 2;
    else if (kind === "harder") m.diffScore = Math.min(3, m.diffScore + 0.5);
    else if (kind === "easier") m.diffScore = Math.max(1, m.diffScore - 0.5);
    else if (kind === "block" && category && !m.blockedTopics.includes(category)) m.blockedTopics.push(category);
    m.feedbackLog = [...m.feedbackLog.slice(-29), { kind, category, ts: Date.now() }];
    m.updatedAt = Date.now();
    saveState();
  },

  unblock(pk, category) {
    const m = Learn.model(pk);
    m.blockedTopics = m.blockedTopics.filter(t => t !== category);
    saveState();
  },

  /* --- קריאת ההעדפות הנלמדות --- */

  /* משקל קטגוריה: העדפה מוצהרת + הצלחה + משוב, פחות דילוגים וחוסר עניין */
  categoryWeight(pk, category) {
    const m = Learn.model(pk);
    const c = m.categories[category];
    let w = 1.0;
    const declared = (state.players[pk].topics || "").split(",").map(s => s.trim());
    if (declared.some(t => t && category.includes(t))) w += 0.5;
    if (c) {
      const n = c.shown || 1;
      w += (c.liked * 0.4 + c.more * 0.3 - c.disliked * 0.5 - c.skipped * 0.2) / Math.max(2, n / 2);
      w += ((c.correct - c.wrong) / n) * 0.2; // הצלחה קלה מוסיפה, כישלון עקבי מוריד מעט
    }
    if (m.blockedTopics.includes(category)) w = 0;
    return Math.max(0, w);
  },

  blockedFor(pk) { return Learn.model(pk).blockedTopics; },
  blockedAll() { return [...new Set([...Learn.blockedFor("p1"), ...Learn.blockedFor("p2")])]; },

  difficultyWord(pk) {
    const d = Learn.model(pk).diffScore;
    return d < 1.7 ? "קל" : d > 2.4 ? "מאתגר" : "בינוני";
  },

  /* ביטחון: כמה מידע נצבר. עד 20 תשובות — "מתחילים להבין" */
  confidence(pk) {
    const m = Learn.model(pk);
    const samples = Object.values(m.categories).reduce((a, c) => a + c.shown, 0) + m.feedbackLog.length;
    return Math.min(1, samples / 20);
  },

  confidencePhrase() {
    const c = (Learn.confidence("p1") + Learn.confidence("p2")) / 2;
    if (c < 0.25) return "אנחנו רק מתחילים להכיר אתכם — שחקו עוד קצת ונדייק.";
    if (c < 0.6) return "אנחנו מתחילים להבין מה אתם אוהבים. המשחק הבא כבר יהיה קצת יותר מותאם לכם.";
    return "המשחק כבר מכיר את הטעם שלכם — השאלות נבחרות לפי מה שאהבתם.";
  },

  /* סיכום למסך "מה המשחק למד עלינו?" — בלי אבחנות ובלי תיוגים */
  summary(pk) {
    const m = Learn.model(pk);
    const cats = Object.entries(m.categories).filter(([, c]) => c.shown >= 2);
    const bySuccess = [...cats].sort((a, b) => (b[1].correct / b[1].shown) - (a[1].correct / a[1].shown));
    const byLove = [...cats].sort((a, b) => Learn.categoryWeight(pk, b[0]) - Learn.categoryWeight(pk, a[0]));
    const avgMs = m.answers ? Math.round(m.answerMsTotal / m.answers / 1000) : null;
    return {
      strong: bySuccess.slice(0, 3).map(([name, c]) => ({ name, rate: Math.round(100 * c.correct / c.shown) })),
      loved: byLove.slice(0, 3).map(([name]) => name),
      difficulty: Learn.difficultyWord(pk),
      avgSeconds: avgMs,
      blocked: m.blockedTopics,
      confidence: Learn.confidence(pk),
      samples: Object.values(m.categories).reduce((a, c) => a + c.shown, 0),
    };
  },

  /* --- שליטה ומחיקה --- */
  resetPlayer(pk) { state.players[pk].model = Learn.emptyModel(); saveState(); },
  resetAll() { Learn.resetPlayer("p1"); Learn.resetPlayer("p2"); },
};
