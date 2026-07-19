/* ===== סוכן התוכן =====
   סוכן AI אוטונומי שרץ ברקע לאורך כל המשחק:
   1. מנטר את מלאי השאלות הטריות בכל סוג משחקון.
   2. מתעדף לפי מה שנלמד על המשתתפים (סוגים אהובים, קטגוריות, קושי).
   3. מייצר חבילות חדשות דרך Claude — עם היסטוריית השאלות שהוצגו, כדי שלא יחזרו.
   4. שומר הכול בתור המקומי, כך שגם בלי רשת יש רצף. */

const Agent = {
  TARGET_FRESH: 10,     // כמה שאלות טריות לשמור בתור לכל סוג
  TICK_MS: 40000,       // בדיקת מלאי כל 40 שניות
  running: false,
  timer: null,
  lastError: null,
  generatedTotal: 0,

  start() {
    if (Agent.timer || !state.apiKey) return;
    Agent.timer = setInterval(() => Agent.tick(), Agent.TICK_MS);
    Agent.tick(); // ריצה ראשונה מיידית
  },

  stop() {
    if (Agent.timer) clearInterval(Agent.timer);
    Agent.timer = null;
  },

  freshCount(t) {
    return Engine.poolGet(t).filter(q => !Engine.wasShownRecently(q) && !Engine.isBlocked(q)).length;
  },

  totalFresh() {
    return Object.keys(GAME_TYPES).reduce((a, t) => a + Agent.freshCount(t), 0);
  },

  /* אילו סוגים צריכים מילוי, מסודרים לפי דחיפות + העדפות נלמדות */
  needs() {
    const types = Object.keys(GAME_TYPES).filter(t => t !== "hot" || state.settings.intimacy);
    return types
      .map(t => {
        const fresh = Agent.freshCount(t);
        const use = (Learn.model("p1").typeUse[t] || 0) + (Learn.model("p2").typeUse[t] || 0);
        return { t, fresh, score: (Agent.TARGET_FRESH - fresh) + Math.min(5, use) * 0.6 };
      })
      .filter(x => x.fresh < Agent.TARGET_FRESH)
      .sort((a, b) => b.score - a.score);
  },

  async tick() {
    if (!state.apiKey) { Agent.stop(); return; }
    if (Agent.running || !navigator.onLine) return;
    const need = Agent.needs()[0];
    if (!need) { Agent.status(); return; }
    Agent.running = true;
    Agent.status(`מחפש שאלות ${GAME_TYPES[need.t].name} חדשות...`);
    try {
      const qs = await generateAIQuestions(need.t, 5);
      Engine.poolAdd(need.t, qs);
      Agent.generatedTotal += qs.length;
      Agent.lastError = null;
    } catch (e) {
      Agent.lastError = e.message;
      console.warn("content agent:", e);
    }
    Agent.running = false;
    Agent.status();
  },

  /* עדכון שורת הסטטוס בתפריט (אם מוצגת) */
  status(activity) {
    const el = document.getElementById("ai-status");
    if (!el || document.getElementById("screen-menu").classList.contains("hidden")) return;
    if (!state.apiKey) {
      const fresh = Object.keys(FALLBACK_BANK).reduce((a, t) =>
        a + (FALLBACK_BANK[t] || []).filter(q => !Engine.wasShownRecently(q)).length, 0);
      el.textContent = fresh < 25
        ? "📚 המאגר המקומי כמעט מוצה — הוסיפו מפתח API בהגדרות והסוכן ימלא אותו בשאלות חדשות"
        : "📚 מאגר מובנה + תור מקומי. הוסיפו מפתח API להפעלת סוכן השאלות.";
      return;
    }
    const stock = Agent.totalFresh();
    const mode = state.settings.grounding ? "עם אימות אסמכתאות 🌐" : "";
    el.textContent = activity
      ? `🤖 הסוכן ${activity} ${mode}`
      : `🤖 סוכן השאלות פעיל ${mode} · ${stock} שאלות טריות בתור` +
        (Agent.lastError ? ` · ⚠️ ${Agent.lastError}` : "");
  },
};
