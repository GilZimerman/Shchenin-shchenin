const { chromium } = require('playwright-core');
const URL = 'file:///home/user/Shchenin-shchenin/trivia/index.html';
let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}`); }
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  // ---------- תרחיש 1: זוג חדש מזין שמות ומתחיל ----------
  console.log('\n[1] זוג חדש — הזנת פרופילים והתחלה');
  await page.goto(URL);
  check('מסך היכרות מוצג', await page.isVisible('#screen-setup'));
  await page.fill('#inp-p1-name', 'גיל');
  await page.fill('#inp-p2-name', 'אניה');
  await page.fill('#inp-p1-topics', 'מכוניות, מכבי חיפה');
  await page.fill('#inp-p2-topics', 'אופנה, מוזיקה');
  await page.selectOption('#inp-p1-diff', 'hard');
  await page.selectOption('#inp-p2-diff', 'easy');   // תרחיש 3: רמות קושי שונות
  const driverLabel = await page.$eval('#inp-driver option', o => o.textContent);
  check('תוויות הנהג מציגות שמות אמיתיים', driverLabel === 'אניה');
  await page.click('#btn-start');
  check('תפריט מוצג', await page.isVisible('#screen-menu'));
  const greeting = await page.textContent('#menu-greeting');
  check('הברכה משתמשת בשם הנהגת', greeting.includes('אניה'));
  check('אין כינויים גנריים בברכה', !/בן הזוג|בת הזוג|הפרטנר|שחקן/.test(greeting));
  const learnLine = await page.textContent('#menu-learning');
  check('שפה כנה בתחילת הדרך ("רק מתחילים")', learnLine.includes('מתחילים'));

  // ---------- תרחיש 3: רמות קושי שונות נשמרות בנפרד ----------
  console.log('\n[3] העדפות נפרדות לכל משתתף');
  const players = await page.evaluate(() => ({ p1: state.players.p1.prefDiff, p2: state.players.p2.prefDiff, t1: state.players.p1.topics, t2: state.players.p2.topics }));
  check('קושי p1=hard', players.p1 === 'hard');
  check('קושי p2=easy', players.p2 === 'easy');
  check('נושאים נפרדים', players.t1 !== players.t2);

  // ---------- סיבוב מלא עם שמות, משוב וקאמבק ----------
  console.log('\n[6] סיבוב ראש בראש: שמות, פער גדול, הצעת קאמבק גלויה');
  await page.click('#game-grid .game-card:first-child');
  await page.waitForSelector('#screen-game:not(.hidden)');
  let sawComeback = false, sawTransition = false;
  for (let i = 0; i < 5; i++) {
    if (await page.isVisible('#comeback-offer')) {
      sawComeback = true;
      const cbText = await page.textContent('#comeback-text');
      check('הצעת קאמבק גלויה ומזכירה הסכמה', cbText.includes('הסכמה') || cbText.includes('מסכימים'));
      await page.click('#btn-comeback-yes');
    }
    if (await page.isVisible('#q-transition')) sawTransition = true;
    const target = await page.textContent('#q-target');
    check(`שאלה ${i + 1}: פנייה בשם`, /גיל|אניה/.test(target));
    await page.click('#game-actions .btn.warn');       // חשיפה
    check(`שאלה ${i + 1}: סרגל משוב מוצג`, await page.isVisible('#feedback-bar'));
    if (i === 1) {   // תרחיש 4: משוב "פחות בנושא"
      await page.click('#feedback-bar .chip[data-fb="less"]');
    }
    // גיל (תור אי-זוגי idx 0,2,4) עונה נכון תמיד — יוצר פער => קאמבק לאניה
    const btns = await page.$$('#game-actions .btn');
    const isGilTurn = target.includes('גיל');
    await (isGilTurn ? btns[0] : btns[1]).click();
    await page.waitForTimeout(80);
  }
  check('הוצעה הצעת קאמבק כשנוצר פער', sawComeback);
  await page.waitForSelector('#screen-result:not(.hidden)', { timeout: 3000 });
  const title = await page.textContent('#result-title');
  check('כותרת סיום עם שם', /גיל|אניה/.test(title));
  const hls = await page.textContent('#result-highlights');
  check('רגעים מצטיינים מוצגים', hls.length > 5);
  check('שפת למידה כנה בסיום', (await page.textContent('#result-learning')).length > 5);
  check('הצעה למשחק הבא', (await page.textContent('#result-suggestion')).length > 5);

  // ---------- תרחיש 4+5: חסימת נושא והחזרתו ----------
  console.log('\n[4+5] חסימת נושא במשוב והחזרתו במסך הלמידה');
  await page.click('#btn-menu');
  await page.click('#game-grid .game-card:first-child');
  await page.waitForSelector('#screen-game:not(.hidden)');
  const blockedCat = await page.textContent('#q-category');
  await page.click('#game-actions .btn.warn');
  await page.click('#feedback-bar .chip[data-fb="block"]');
  const blocked = await page.evaluate(() => Learn.blockedAll());
  check('הנושא נחסם', blocked.length === 1);
  await page.click('#btn-quit');
  await page.click('#btn-learned');
  check('מסך "מה למדנו" נפתח', await page.isVisible('#dlg-learned'));
  const learnedTxt = await page.textContent('#learned-content');
  check('הנושא החסום מוצג', learnedTxt.includes(blocked[0]));
  await page.click('.learned-player .tag button');   // תרחיש 5: החזרת נושא
  const blockedAfter = await page.evaluate(() => Learn.blockedAll());
  check('הנושא הוחזר', blockedAfter.length === 0);
  await page.click('#learn-close');

  // ---------- תרחיש 12: מניעת חזרה על שאלה ----------
  console.log('\n[12] מניעת הצגה חוזרת');
  const shownCount = await page.evaluate(() => Object.keys(state.shownIds).length);
  check('שאלות מסומנות כמוצגות', shownCount >= 6);
  const norepeat = await page.evaluate(() => {
    const q = FALLBACK_BANK.head2head[0];
    state.shownIds[Engine.qid(q)] = Date.now();
    const picked = Engine.fromBank('head2head', 5, []);
    return !picked.some(p => Engine.qid(p) === Engine.qid(q));
  });
  check('שאלה שהוצגה לא נבחרת שוב בטווח הקירור', norepeat);

  // ---------- מעברים: מגוון ואי-חזרתיות ----------
  console.log('\n[מעברים] 36 קטעים, בלי חזרה מהירה');
  const transCheck = await page.evaluate(() => {
    const seen = new Set();
    state.transitionsShown = []; state.lastTransitionKind = null;
    for (let i = 0; i < 12; i++) {
      const t = pickTransition(buildCtx({ current_player_name: 'גיל' }));
      if (t) seen.add(t);
    }
    return { unique: seen.size, total: TRANSITIONS.length, hasNames: [...seen].some(t => t.includes('גיל') || t.includes('אניה')) };
  });
  check(`מאגר מעברים גדול (${transCheck.total} >= 30)`, transCheck.total >= 30);
  check(`12 מעברים רצופים בלי חזרה (${transCheck.unique})`, transCheck.unique >= 11);
  check('מעברים משתמשים בשמות', transCheck.hasNames);
  check('אין {{placeholders}} לא מפוענחים', await page.evaluate(() => {
    for (let i = 0; i < 20; i++) {
      const t = pickTransition(buildCtx({ current_player_name: 'גיל' }));
      if (t && /\{\{/.test(t)) return false;
    }
    return true;
  }));

  // ---------- מצבים: שיתופי, ערבוב חכם, אורך ----------
  console.log('\n[מצבים] שיתופי + ערבוב חכם + אורך');
  await page.click('#scoring-chips .chip[data-scoring="coop"]');
  await page.click('#length-chips .chip[data-len="short"]');
  await page.click('#mode-grid .game-card:nth-child(2)');   // ערבוב חכם
  await page.waitForSelector('#screen-game:not(.hidden)', { timeout: 5000 });
  const mixTypes = await page.evaluate(() => [...new Set(round.questions.map(q => q.qtype))]);
  check(`סיבוב מעורב (${mixTypes.length} סוגים)`, mixTypes.length >= 2);
  check('אורך קצר = 5 שאלות', await page.evaluate(() => round.questions.length === 5));
  const coopScore = await page.textContent('#scorebox-game');
  check('ניקוד שיתופי מוצג', coopScore.includes('הצוות'));
  // משחקים את הסיבוב השיתופי עד הסוף
  for (let i = 0; i < 5; i++) {
    if (await page.isVisible('#comeback-offer')) await page.click('#btn-comeback-no');
    const reveal = await page.$('#game-actions .btn.warn');
    if (reveal && (await reveal.textContent()).includes('חשיפ')) await reveal.click();
    await page.click('#game-actions .btn.primary, #game-actions .btn.pink');
    await page.waitForTimeout(1700); // רמזים משהים 1.6 שניות
  }
  await page.waitForSelector('#screen-result:not(.hidden)', { timeout: 5000 });
  const coopTitle = await page.textContent('#result-title');
  check('סיום שיתופי — "יחד"/צוות', /יחד|צוות|המשחק/.test(coopTitle));
  await page.click('#btn-menu');
  await page.click('#scoring-chips .chip[data-scoring="comp"]');

  // ---------- תרחיש 9: מצב למבוגרים — הפעלה וביטול ----------
  console.log('\n[9] מצב למבוגרים: הסכמה כפולה וביטול');
  const adultCard = await page.$$eval('#mode-grid .game-card', cards =>
    cards.findIndex(c => c.textContent.includes('למבוגרים')));
  check('כרטיס מצב למבוגרים קיים', adultCard >= 0);
  await page.click(`#mode-grid .game-card:nth-child(${adultCard + 1})`);
  check('דיאלוג הסכמה נפתח', await page.isVisible('#dlg-adult'));
  check('כפתור התחלה נעול בלי הסכמה', await page.$eval('#adult-go', b => b.disabled));
  await page.check('#adult-ok-1');
  check('עדיין נעול עם הסכמה אחת', await page.$eval('#adult-go', b => b.disabled));
  await page.check('#adult-ok-2');
  check('נפתח עם שתי הסכמות', !(await page.$eval('#adult-go', b => b.disabled)));
  await page.click('#adult-cancel');   // ביטול
  check('ביטול סוגר את הדיאלוג', !(await page.isVisible('#dlg-adult')));

  // ---------- שמירה והמשך ----------
  console.log('\n[שמירה] סיבוב נקטע → באנר המשך → שחזור');
  await page.click('#game-grid .game-card:first-child');
  await page.waitForSelector('#screen-game:not(.hidden)');
  await page.click('#game-actions .btn.warn');
  await page.click('#game-actions .btn.primary');   // שאלה 1 הושלמה
  await page.waitForTimeout(150);
  await page.click('#btn-quit');                    // נוטשים באמצע
  check('באנר המשך מוצג', await page.isVisible('#resume-banner'));
  await page.reload();                              // גם אחרי רענון (persist)
  check('באנר המשך שרד רענון', await page.isVisible('#resume-banner'));
  await page.click('#btn-resume');
  await page.waitForSelector('#screen-game:not(.hidden)');
  const resumedCounter = await page.textContent('#q-counter');
  check('חזרנו לשאלה 2', resumedCounter.includes('2'));
  await page.click('#btn-quit');

  // ---------- תרחיש 8: תיקון שם (הקראה) ----------
  console.log('\n[8] תיקון שם דרך עריכת פרופיל');
  await page.click('#btn-settings');
  await page.click('#set-profile');
  check('חזרה למסך פרופילים', await page.isVisible('#screen-setup'));
  await page.fill('#inp-p2-name', 'אנְיה');    // תיקון פונטי להקראה
  await page.click('#btn-start');
  const fixedName = await page.evaluate(() => state.players.p2.name);
  check('השם המתוקן נשמר בדיוק כפי שהוזן', fixedName === 'אנְיה');
  check('הברכה משתמשת בשם המתוקן', (await page.textContent('#menu-greeting')).includes('אנְיה'));
  await page.click('#btn-settings');
  await page.click('#set-profile');
  await page.fill('#inp-p2-name', 'אניה');
  await page.click('#btn-start');

  // ---------- למידה: התאמת קושי ----------
  console.log('\n[למידה] קושי עולה אחרי רצף הצלחות');
  const diffTest = await page.evaluate(() => {
    Learn.resetPlayer('p1');
    const before = Learn.model('p1').diffScore;
    for (let i = 0; i < 8; i++) Learn.record('p1', { category: 'מוזיקה', correct: true, ms: 4000, qtype: 'head2head' });
    return { before, after: Learn.model('p1').diffScore, word: Learn.difficultyWord('p1') };
  });
  check(`קושי עלה (${diffTest.before} → ${diffTest.after})`, diffTest.after > diffTest.before);
  const diffDown = await page.evaluate(() => {
    Learn.resetPlayer('p2');
    const before = Learn.model('p2').diffScore;
    for (let i = 0; i < 8; i++) Learn.record('p2', { category: 'היסטוריה', correct: false, ms: 9000, qtype: 'head2head' });
    return { before, after: Learn.model('p2').diffScore };
  });
  check(`קושי ירד אחרי כישלונות (${diffDown.before} → ${diffDown.after})`, diffDown.after < diffDown.before);

  // ---------- תרחיש 10: איפוס הלמידה ----------
  console.log('\n[10] איפוס כל מה שנלמד');
  page.on('dialog', d => d.accept());
  await page.click('#btn-learned');
  await page.click('#learn-reset');
  const afterReset = await page.evaluate(() => Learn.confidence('p1') + Learn.confidence('p2'));
  check('הלמידה אופסה לגמרי', afterReset === 0);
  const namesKept = await page.evaluate(() => state.players.p1.name === 'גיל');
  check('הפרופילים (שמות) נשמרו', namesKept);
  // השבתת למידה
  await page.uncheck('#learn-enabled');
  const noLearn = await page.evaluate(() => {
    Learn.record('p1', { category: 'בדיקה', correct: true, ms: 1000, qtype: 'head2head' });
    return !Learn.model('p1').categories['בדיקה'];
  });
  check('כשהלמידה כבויה — לא נאספים אותות', noLearn);
  await page.check('#learn-enabled');
  await page.click('#learn-close');

  // ---------- תרחיש 7: ללא רשת (אין מפתח API) ----------
  console.log('\n[7] משחק בלי רשת/מפתח — מאגר מקומי');
  const aiStatus = await page.textContent('#ai-status');
  check('סטטוס מציג מאגר מקומי', aiStatus.includes('מובנה') || aiStatus.includes('מקומי'));
  const offline = await page.evaluate(() => Engine.buildRound('smart', null, 8).length);
  check('סיבוב שלם נבנה בלי רשת', offline === 8);

  // ---------- תרחיש 2: דילוג על ההיכרות ----------
  console.log('\n[2] דילוג על תהליך ההיכרות');
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload();
  check('מסך היכרות למשתמש חדש', await page.isVisible('#screen-setup'));
  await page.click('#btn-skip-setup');
  check('נכנסים ישר לתפריט', await page.isVisible('#screen-menu'));
  const skipNames = await page.evaluate(() => [state.players.p1.name, state.players.p2.name]);
  check('שמות מהטופס נשמרו גם בדילוג', skipNames[0] === 'גיל' && skipNames[1] === 'אניה');

  // ---------- הגירה מגרסה 1 ----------
  console.log('\n[הגירה] נתוני v1 עוברים ל-v2');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('roadtrivia_v1', JSON.stringify({
      profile: { p1: 'דנה', p2: 'יוסי', driver: 'p1', intimacy: true, intimacyLevel: 'flirty' },
      scores: { p1: 7, p2: 5 }, tts: true, apiKey: '', usedQuestions: [], usedPrizes: [],
    }));
  });
  await page.reload();
  const migrated = await page.evaluate(() => ({
    names: [state.players?.p1?.name, state.players?.p2?.name],
    scores: [state.scores.p1, state.scores.p2],
  }));
  check('שמות v1 הועברו', migrated.names[0] === 'דנה' && migrated.names[1] === 'יוסי');
  check('ניקוד v1 נשמר', migrated.scores[0] === 7 && migrated.scores[1] === 5);

  console.log(`\n========== סיכום: ${pass} עברו, ${fail} נכשלו ==========`);
  console.log('JS errors:', errors.length ? errors.join('\n') : 'none ✅');
  await browser.close();
  process.exit(fail > 0 || errors.length > 0 ? 1 : 0);
})().catch(e => { console.error('SUITE CRASHED:', e); process.exit(1); });
