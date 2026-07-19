/* ===== מערכת תבניות שפה + קטעי מעבר =====
   כל טקסט פונה למשתתפים בשמות שהוזנו, לעולם לא בכינויים כלליים. */

/* משתני התבנית הנתמכים:
   {{player_1_name}} {{player_2_name}} {{current_player_name}} {{other_player_name}}
   {{leading_player_name}} {{trailing_player_name}} {{driver_name}} {{score_difference}} */
function T(template, ctx) {
  if (!template) return "";
  return template.replace(/\{\{(\w+)\}\}/g, (m, key) => (ctx && ctx[key] != null) ? String(ctx[key]) : m);
}

/* בניית הקשר שמות/ניקוד עדכני — app.js קורא לזה לפני כל רינדור טקסט */
function buildCtx(extra) {
  const p1 = state.players.p1, p2 = state.players.p2;
  const s1 = totalScore("p1"), s2 = totalScore("p2");
  const leading = s1 === s2 ? null : (s1 > s2 ? "p1" : "p2");
  const ctx = {
    player_1_name: p1.name,
    player_2_name: p2.name,
    leading_player_name: leading ? state.players[leading].name : p1.name,
    trailing_player_name: leading ? state.players[leading === "p1" ? "p2" : "p1"].name : p2.name,
    driver_name: state.settings.driver === "none" ? "" : state.players[state.settings.driver].name,
    score_difference: Math.abs(s1 - s2),
  };
  return Object.assign(ctx, extra || {});
}

/* עובדות מאומתות לקטעי מעבר (מקור: מאגר השאלות המאומת) */
const TRANSITION_FACTS = [
  "לתמנון יש שלושה לבבות — ועדיין לא ברור אם הוא זוכר תאריכים.",
  "דבש שנשמר סגור היטב כמעט ולא מתקלקל לעולם. כמו זוגיות טובה, רק דביק יותר.",
  "אסטרונאוטים בחלל נהיים גבוהים יותר בכ-5 ס\"מ. סוף סוף פתרון למי שרצה עוד קצת גובה.",
  "קנגורו לא מסוגל ללכת אחורה. יש אנשים שגם ככה בוויכוחים.",
  "וולוו בלטינית פירושו 'אני מתגלגל'. מתאים לרגע הזה בנסיעה.",
  "בפסנתר יש 88 קלידים. במשחק הזה מספיק קליד אחד — הפה.",
  "אור השמש שאתם רואים עכשיו יצא מהשמש לפני יותר מ-8 דקות.",
  "העטלף הוא היונק היחיד שבאמת עף. סנאים 'מעופפים' רק משוויצים.",
  "בננה היא בעצם עשב ענק, לא עץ. תחשבו על זה עד השאלה הבאה.",
  "שמפניה אמיתית מגיעה רק מחבל שמפאן. כל השאר — יין מבעבע עם ביטחון עצמי.",
];

/* ===== 36 קטעי מעבר =====
   kind: score (יתרון קיים) | close (צמוד) | fact | humor | tip | sport | tease | praise | blitz
   cond: "lead" דורש הפרש ניקוד, "close" דורש הפרש 0-1, אחרת תמיד מתאים */
const TRANSITIONS = [
  // --- מצב המשחק: יתרון ---
  { id: "t01", kind: "score", cond: "lead", text: "{{leading_player_name}} מוביל/ה כרגע, אבל {{trailing_player_name}} כבר חימם/ה מנועים." },
  { id: "t02", kind: "score", cond: "lead", text: "{{score_difference}} נקודות הפרש. נשמע הרבה? במשחק הזה זה מתאדה בשתי שאלות." },
  { id: "t03", kind: "score", cond: "lead", text: "{{trailing_player_name}}, זה בדיוק הרגע שממנו מתחילים סיפורי קאמבק." },
  { id: "t04", kind: "score", cond: "lead", text: "סטטיסטית, מי שמוביל מתחיל להתרברב בדיוק שאלה אחת לפני שהוא מפסיד. רק אומרים, {{leading_player_name}}." },
  { id: "t05", kind: "sport", cond: "lead", text: "שידור חוזר מהאולפן: {{leading_player_name}} שולט/ת במגרש, אבל הקהל ביציע של {{trailing_player_name}} מסרב להתייאש!" },
  // --- מצב המשחק: צמוד ---
  { id: "t06", kind: "score", cond: "close", text: "התוצאה צמודה מספיק כדי שמישהו כאן יתחיל להאשים את השאלות." },
  { id: "t07", kind: "score", cond: "close", text: "צמוד. מתוח. בדיוק כמו שמשחק זוגי טוב צריך להיות." },
  { id: "t08", kind: "sport", cond: "close", text: "דקה 85, תיקו מסעיר! שני הצדדים מסרבים לוותר, והשופט (זה אני) נהנה מכל רגע." },
  { id: "t09", kind: "score", cond: "close", text: "ההפרש כל כך קטן שהשאלה הבאה שווה את כל הכבוד המשפחתי." },
  // --- עובדות ---
  { id: "t10", kind: "fact", text: "עובדה קטנה לפני שממשיכים: {{fact}}" },
  { id: "t11", kind: "fact", text: "הידעתם? {{fact}}" },
  { id: "t12", kind: "fact", text: "רגע של מדע בין שאלות: {{fact}}" },
  // --- הומור כללי ---
  { id: "t13", kind: "humor", text: "תזכורת ידידותית: התשובות של המנחה סופיות. גם כשהוא טועה. במיוחד כשהוא טועה." },
  { id: "t14", kind: "humor", text: "אם אתם מתווכחים על תשובה — זה סימן שהמשחק עובד." },
  { id: "t15", kind: "humor", text: "רגע של תרבות, ואז חוזרים לריב על גיאוגרפיה." },
  { id: "t16", kind: "humor", text: "המנחה מבקש להזכיר: הניקוד הוא זמני. הזכות להתנשא — נצחית." },
  { id: "t17", kind: "humor", text: "שאלה הבאה בעוד שלוש... שתיים... טוב, אין לי סבלנות. הנה היא." },
  { id: "t18", kind: "humor", text: "אין תשובות שגויות. טוב, יש. אבל אומרים את זה בחום." },
  // --- טיפים זוגיים ---
  { id: "t19", kind: "tip", text: "טיפ קטן: זוגות שצוחקים יחד על טעויות — מנצחים גם כשהם מפסידים." },
  { id: "t20", kind: "tip", text: "מחקרים מראים ששיחות טובות בנסיעה נשארות בזיכרון. אתם באמצע אחת כזאת." },
  { id: "t21", kind: "tip", text: "תזכורת: לנצח בוויכוח זה נחמד. לעצור לגלידה יחד — נחמד יותר." },
  // --- שדר ספורט ---
  { id: "t22", kind: "sport", text: "ערב טוב מהאצטדיון הנייד! האווירה חשמלית, הקהל (שניכם) על הרגליים!" },
  { id: "t23", kind: "sport", text: "והנה מגיעה השאלה הבאה, חוצה את קו האמצע... איזו מתיחות באוויר!" },
  // --- טיזרים ---
  { id: "t24", kind: "tease", text: "{{current_player_name}}, זאת בדיוק השאלה שיכולה להפוך יתרון קטן לנאום ניצחון מוגזם." },
  { id: "t25", kind: "tease", text: "השאלה הבאה נראית תמימה. היא לא." },
  { id: "t26", kind: "tease", text: "{{current_player_name}}, קח/י נשימה. זו שאלה מהסוג שזוכרים." },
  // --- מחמאות ---
  { id: "t27", kind: "praise", text: "{{player_1_name}} ו{{player_2_name}} — רשמית אחד הזוגות המשעשעים ששיחקו כאן היום. גם היחיד, אבל בכל זאת." },
  { id: "t28", kind: "praise", cond: "lead", text: "{{trailing_player_name}}, הדרך שבה את/ה לוקח/ת את זה בספורטיביות? זה הניצחון האמיתי. אבל בוא/י ננצח גם בניקוד." },
  { id: "t29", kind: "praise", text: "שמתם לב שאתם משלימים זה לזו תשובות? זה או אהבה או אימון סודי." },
  // --- בזק / סקר ---
  { id: "t30", kind: "blitz", text: "סקר בזק של עשר שניות: מי משניכם מתמצא יותר בכבישים? ענו יחד בקול... ועכשיו תמשיכו לחייך כאילו הסכמתם." },
  { id: "t31", kind: "blitz", text: "ניחוש מהיר בקול: כמה שאלות נשארו בסיבוב? מי שצדק — זכות התנשאות קצרה." },
  { id: "t32", kind: "blitz", text: "שאלה דמיונית להמשך הדרך: אם המכונית הייתה יכולה לשאול אתכם שאלה אחת — מה היא הייתה שואלת?" },
  // --- מטא / קצב ---
  { id: "t33", kind: "humor", text: "המשחק מדווח: רמת התחרותיות ברכב עלתה ב-14 אחוזים מאז השאלה הקודמת." },
  { id: "t34", kind: "tease", text: "עוד רגע חוזרים. מי שרוצה לנצל את ההפסקה למנטל-גיים על היריב — עכשיו." },
  { id: "t35", kind: "tip", text: "רגע נוסטלגי: תיזכרו שנייה בנסיעה הראשונה שלכם יחד. יפה. עכשיו תתרכזו, יש נקודות על הפרק." },
  { id: "t36", kind: "humor", text: "הודעת שירות: הנהג/ת מתבקש/ת להשאיר את הידיים על ההגה ואת הניצחונות לתא הנוסע." },
];

/* בחירת קטע מעבר: מכבד תנאי ניקוד, לא חוזר על 12 האחרונים, לא פעמיים אותו סוג ברצף */
function pickTransition(ctx) {
  const recent = state.transitionsShown || [];
  const lastKind = state.lastTransitionKind || null;
  const diff = ctx.score_difference;
  const pool = TRANSITIONS.filter(t => {
    if (recent.includes(t.id)) return false;
    if (t.kind === lastKind) return false;
    if (t.cond === "lead" && diff < 2) return false;
    if (t.cond === "close" && diff > 1) return false;
    return true;
  });
  if (!pool.length) { state.transitionsShown = []; return null; }
  const t = pool[Math.floor(Math.random() * pool.length)];
  state.transitionsShown = [...recent.slice(-11), t.id];
  state.lastTransitionKind = t.kind;
  let text = t.text;
  if (t.kind === "fact") {
    const facts = TRANSITION_FACTS.filter(f => !(state.factsShown || []).includes(f));
    const fact = facts.length ? facts[Math.floor(Math.random() * facts.length)] : TRANSITION_FACTS[0];
    state.factsShown = [...(state.factsShown || []).slice(-7), fact];
    ctx = Object.assign({}, ctx, { fact });
  }
  return T(text, ctx);
}

/* משפטי פתיחה וסיום מגוונים */
const ROUND_OPENERS = [
  "יאללה, {{player_1_name}} ו{{player_2_name}} — מתחילים!",
  "הסיבוב יוצא לדרך. שיהיה בהצלחה לשני הצדדים, ובעיקר לצד הצודק.",
  "מוכנים? השאלות כבר התחממו.",
];
const WIN_LINES = [
  "{{winner}} לוקח/ת את הסיבוב! {{loser}}, הקאמבק מתחיל בשאלה הבאה.",
  "ניצחון ל{{winner}}! ההיסטוריונים עוד יתווכחו איך זה קרה.",
  "{{winner}} על המקום הראשון — {{loser}} על הקפה בעצירה הבאה?",
];
const TIE_LINES = [
  "תיקו אמיתי. שניכם טובים מדי, וזו בעיה נהדרת.",
  "שוויון מוחלט — בדיוק כמו שחוזה הנישואים מחייב.",
];
