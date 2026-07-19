const { chromium } = require('playwright-core');
let pass = 0, fail = 0;
const check = (n, c) => { c ? (pass++, console.log(`  ✅ ${n}`)) : (fail++, console.log(`  ❌ ${n}`)); };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file:///home/user/Shchenin-shchenin/trivia/index.html');
  await page.click('#btn-start');

  console.log('[סוכן] תעדוף לפי מלאי ולמידה');
  const needs = await page.evaluate(() => {
    state.apiKey = 'sk-test';
    Learn.model('p1').typeUse.head2head = 6; // סוג אהוב
    return Agent.needs().map(n => n.t);
  });
  check('כל הסוגים דורשים מילוי בהתחלה', needs.length >= 6);
  check('סוג אהוב (ראש בראש) מתועדף ראשון', needs[0] === 'head2head');

  console.log('[סוכן] מילוי תור מוריד את הצורך');
  const afterFill = await page.evaluate(() => {
    const fake = Array.from({ length: 12 }, (_, i) => ({
      question: 'שאלת סוכן ' + i, answer: 'ת' + i, fact: '', category: 'מוזיקה', clues: [], options: [], sources: []
    }));
    Engine.poolAdd('head2head', fake);
    return { fresh: Agent.freshCount('head2head'), stillNeeded: Agent.needs().some(n => n.t === 'head2head') };
  });
  check('התור התמלא (10+ טריות)', afterFill.fresh >= 10);
  check('סוג מלא יוצא מרשימת הצרכים', !afterFill.stillNeeded);

  console.log('[חזרות] היסטוריה נשלחת לסוכן');
  const hist = await page.evaluate(() => {
    Engine.markShown({ question: 'מהי בירת צרפת?', answer: 'פריז' });
    const prompt = buildUserPrompt('head2head', 5, false);
    return { inHistory: state.recentQuestions.includes('מהי בירת צרפת?'), inPrompt: prompt.includes('מהי בירת צרפת?'), queued: prompt.includes('שאלת סוכן 3') };
  });
  check('שאלה שהוצגה נכנסת להיסטוריה', hist.inHistory);
  check('ההיסטוריה מוזרקת לפרומפט של הסוכן', hist.inPrompt);
  check('גם שאלות בתור מוזרקות לפרומפט', hist.queued);

  console.log('[חזרות] מאגר מוצה → הישנות ביותר קודם');
  const oldest = await page.evaluate(() => {
    const bank = FALLBACK_BANK.clues; // 8 בלבד — קל למצות
    bank.forEach((q, i) => { state.shownIds[Engine.qid(q)] = Date.now() - (bank.length - i) * 60000; });
    const picked = Engine.fromBank('clues', 3, []);
    // הישנות ביותר = אלה עם timestamp הנמוך ביותר = האינדקסים הראשונים
    return picked.map(p => bank.findIndex(b => Engine.qid(b) === Engine.qid(p)));
  });
  check(`במיצוי חוזרים מהישנה ביותר (${oldest})`, oldest[0] === 0 && oldest[1] === 1);

  console.log('[תור בסיבוב] שאלות הסוכן נכנסות למשחק');
  await page.evaluate(() => { state.apiKey = ''; }); // בלי רשת — רק תור+מאגר
  const roundQs = await page.evaluate(() => Engine.buildRound(null, 'head2head', 5).map(q => q.question));
  check('סיבוב שואב קודם מתור הסוכן', roundQs.some(q => q && q.startsWith('שאלת סוכן')));

  console.log('[סטטוס] שורת הסוכן בתפריט');
  await page.evaluate(() => { state.apiKey = 'sk-test'; renderMenu(); });
  const status = await page.textContent('#ai-status');
  check('סטטוס מציג את הסוכן ומלאי', status.includes('סוכן') && /\d+/.test(status));
  await page.evaluate(() => { state.apiKey = ''; renderMenu(); });
  const statusOff = await page.textContent('#ai-status');
  check('בלי מפתח — הסבר על הפעלת הסוכן', statusOff.includes('מפתח'));

  console.log(`\n===== סוכן: ${pass} עברו, ${fail} נכשלו =====`);
  console.log('JS errors:', errors.length ? errors.join('; ') : 'none ✅');
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
