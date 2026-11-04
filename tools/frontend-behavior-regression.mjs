import test from 'node:test';
import assert from 'node:assert/strict';
import { createFastRequestDraft } from '../src/domain/fastRequestDraft.js';
import { replaceBilingualAssets } from '../src/domain/assetReplacement.js';
import { withReviewTranslationTimeout, translateReviewText } from '../src/features/reviews/reviewTranslation.js';
import { initialReviewTranslationState, completeReviewTranslation, displayedReviewTranslationText } from '../src/features/reviews/reviewTranslationState.js';
import { withoutOptionalAnalytics } from '../src/domain/analyticsPrivacy.js';
import { resolveBookingReference } from '../src/services/replyMessages.js';
import { financeDetailMoney, financeEntryActions } from '../src/domain/financeModel.js';

test('recognized manual and linked ledger entries never expose direct edit or archive', () => {
  for (const type of ['income', 'expense']) for (const status of ['confirmed', 'reversed', 'reversal', 'cancelled', 'void', 'voided']) {
    for (const linked of [false, true]) for (const active of [true, false]) {
      const entry = { type, status, active, amount: 100, ...(linked ? { booking_request_id: 'synthetic-booking' } : {}) };
      const actions = financeEntryActions(entry);
      assert.equal(actions.edit, false, `${type}/${status}/${linked}/${active}`);
      assert.equal(actions.archive, false, `${type}/${status}/${linked}/${active}`);
    }
  }
});

test('only genuine pending/expected drafts remain editable; recognition evidence fails closed', () => {
  for (const status of ['pending', 'expected']) {
    assert.deepEqual(financeEntryActions({ status, type: 'income', amount: 100, active: true }), { edit: true, archive: true, refund: false });
    assert.deepEqual(financeEntryActions({ status, type: 'expense', amount: 100, booking_request_id: 'synthetic', active: false }), { edit: true, archive: false, refund: false });
    for (const field of ['reversal_of', 'recognized_at', 'admin_confirmed_at', 'reversed_at']) {
      const actions = financeEntryActions({ status, [field]: 'synthetic-evidence' });
      assert.equal(actions.edit, false, `${status}/${field}`);
      assert.equal(actions.archive, false, `${status}/${field}`);
    }
  }
  assert.equal(financeEntryActions().edit, false);
});

test('refund control retains active original confirmed income only, never expense or reversal', () => {
  const entry = { type: 'income', amount: 100, status: 'confirmed', active: true };
  assert.equal(financeEntryActions(entry).refund, true);
  assert.equal(financeEntryActions({ ...entry, booking_request_id: 'synthetic' }).refund, true);
  for (const patch of [{ type: 'expense' }, { active: false }, { reversal_of: 'synthetic' }, { status: 'reversal' }, { status: 'reversed' }, { status: 'pending' }, { amount: 0 }, { amount: -10 }]) {
    assert.equal(financeEntryActions({ ...entry, ...patch }).refund, false);
  }
});

test('mixed-currency report preserves correct single-currency drilldown amounts', () => {
  const income = { type: 'income', amount: 100, currency: 'EUR', status: 'confirmed', active: true };
  const expense = { type: 'expense', amount: 20, currency: 'USD', status: 'confirmed', active: true };
  assert.equal(financeDetailMoney([income, expense], 'net'), null);
  assert.deepEqual(financeDetailMoney([income], 'income'), { currency: 'EUR', amount: 100 });
  assert.deepEqual(financeDetailMoney([expense], 'expenses'), { currency: 'USD', amount: 20 });
  assert.deepEqual(financeDetailMoney([{ ...income, status: 'expected', amount: 60 }], 'expected-income'), { currency: 'EUR', amount: 60 });
});

test('analytics opt-out excludes linkable attribution but preserves booking/idempotency', () => {
  const source={analytics_visitor_id:'v1',analytics_journey_id:'j1',booking_journey_id:'j1',utm_source:'social',referrer:'https://private.invalid',submission_idempotency_key:'request-key',customer_name:'Synthetic',declared_source:'google'};
  assert.deepEqual(withoutOptionalAnalytics(source,false),{submission_idempotency_key:'request-key',customer_name:'Synthetic',declared_source:'google'});
  assert.deepEqual(withoutOptionalAnalytics(source,true),source);
});
test('replies never fabricate an unissued booking or review credential', () => {
  assert.equal(resolveBookingReference({id:'synthetic',created_at:'2026-10-27'}),'');
  assert.equal(resolveBookingReference({booking_code:'already-issued'}),'already-issued');
});

function memory() { const values = new Map(); return { getItem: (key) => values.get(key), setItem: (key,value) => values.set(key,value), removeItem: (key) => values.delete(key), values }; }
test('closing saves latest draft; contact and attribution free text never persist', () => {
  const storage = memory(); const draft = createFastRequestDraft(storage);
  draft.update({experienceId:'etna-premium'});
  draft.update({experienceId:'etna-learning',customDate:'2026-11-10',adults:'3',email:'synthetic@example.invalid',phone:'+390000000',heardAboutUsDetail:'private text'});
  draft.save(); const saved = JSON.parse(storage.getItem('vulcaniq_fast_request'));
  assert.equal(saved.experienceId,'etna-learning'); assert.equal(saved.adults,'3'); assert.equal(saved.customDate,'2026-11-10');
  assert.equal(saved.email,undefined); assert.equal(saved.phone,undefined); assert.equal(saved.heardAboutUsDetail,undefined);
});
test('successful submission cannot recreate stale draft on unmount', () => {
  const storage=memory(); const draft=createFastRequestDraft(storage); draft.update({experienceId:'etna-learning'}); draft.save(); draft.submitted(); draft.update({experienceId:'etna-learning'}); draft.save(); assert.equal(storage.values.size,0);
});
test('blocked browser storage does not block the booking journey', () => { const draft=createFastRequestDraft(null); draft.update({adults:'2'}); assert.doesNotThrow(()=>{draft.save();draft.submitted();draft.save();}); });
test('failed second-language upload removes only new uncommitted upload', async () => {
  const removed=[]; let committed=false;
  await assert.rejects(replaceBilingualAssets({uploadIt:async()=>({path:'new-it'}),uploadEn:async()=>{throw Error('upload failed');},removeNew:async(a)=>removed.push(a.path),commit:async()=>{committed=true;}}));
  assert.deepEqual(removed,['new-it']); assert.equal(committed,false);
});
test('DB failure preserves old references and ambiguous newly uploaded bytes', async () => {
  const removed=[];
  await assert.rejects(replaceBilingualAssets({uploadIt:async()=>({path:'new-it'}),uploadEn:async()=>({path:'new-en'}),removeNew:async(a)=>removed.push(a.path),commit:async()=>{throw Error('lost response');}}));
  assert.deepEqual(removed,[]);
});
test('successful asset replacement commits both languages together and retains rollback bytes', async () => {
  const removed=[];
  const result=await replaceBilingualAssets({uploadIt:async()=>({path:'new-it'}),uploadEn:async()=>({path:'new-en'}),removeNew:async(a)=>removed.push(a.path),commit:async(it,en)=>({it:it.path,en:en.path})});
  assert.deepEqual(result,{it:'new-it',en:'new-en'}); assert.deepEqual(removed,[]);
});
test('stalled translation has a bounded failure', async () => { await assert.rejects(withReviewTranslationTimeout(new Promise(()=>{}),10),{code:'translation_timeout'}); });
test('translation cannot cross review or target-language boundaries', () => {
  const state=initialReviewTranslationState({reviewId:'a',originalText:'Ciao',targetLanguage:'en'});
  assert.throws(()=>completeReviewTranslation(state,{reviewId:'b',translatedText:'Hello',sourceLanguage:'it',targetLanguage:'en'}),{code:'translation_stale_result'});
  assert.throws(()=>completeReviewTranslation(state,{reviewId:'a',translatedText:'Bonjour',sourceLanguage:'it',targetLanguage:'fr'}),{code:'translation_stale_result'});
  assert.equal(displayedReviewTranslationText(state),'Ciao');
});
test('unchanged translation remains original and releases the model', async () => {
  let destroyed=false;
  globalThis.LanguageDetector={create:async()=>({detect:async()=>[{detectedLanguage:'it'}],destroy(){}})};
  globalThis.Translator={create:async()=>({translate:async()=> 'Ciao',destroy(){destroyed=true;}})};
  await assert.rejects(translateReviewText({text:'Ciao',targetLanguage:'en',sourceLanguage:'en'}),{code:'translation_unchanged_result'});
  assert.equal(destroyed,true); delete globalThis.LanguageDetector; delete globalThis.Translator;
});

test('closing cancels an in-flight translator immediately and releases the model', async () => {
  const controller = new AbortController(); let destroyed = false; let started;
  const translating = new Promise(resolve => { started = resolve; });
  globalThis.LanguageDetector = { create: async () => ({ detect: async () => [{ detectedLanguage: 'it' }], destroy() {} }) };
  globalThis.Translator = { create: async () => ({ translate: () => { started(); return new Promise(() => {}); }, destroy() { destroyed = true; } }) };
  try {
    const result = translateReviewText({ text: 'Ciao', targetLanguage: 'en', signal: controller.signal });
    await translating; controller.abort();
    await assert.rejects(result, { code: 'translation_cancelled' });
    assert.equal(destroyed, true);
  } finally { delete globalThis.LanguageDetector; delete globalThis.Translator; }
});

test('late model creation after cancellation is destroyed and never translated', async () => {
  const controller = new AbortController(); let create; let destroyed = false; let called = false;
  globalThis.LanguageDetector = { create: async () => ({ detect: async () => [{ detectedLanguage: 'it' }], destroy() {} }) };
  globalThis.Translator = { create: () => new Promise(resolve => { create = resolve; }) };
  try {
    const result = translateReviewText({ text: 'Ciao', targetLanguage: 'en', sourceLanguage: 'it', sourceLanguageSource: 'detected', signal: controller.signal });
    await Promise.resolve(); await Promise.resolve(); controller.abort();
    await assert.rejects(result, { code: 'translation_cancelled' });
    create({ translate() { called = true; }, destroy() { destroyed = true; } });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(destroyed, true); assert.equal(called, false);
  } finally { delete globalThis.LanguageDetector; delete globalThis.Translator; }
});
