export function runtimeBudget(){return{external:0,d1:0,maxExternal:35,maxD1:700};}
export async function notificationFetch(env,url,options={}){
  const budget=env.NOTIFICATION_RUNTIME_BUDGET||(env.NOTIFICATION_RUNTIME_BUDGET=runtimeBudget());
  if(budget.external>=budget.maxExternal)throw new Error('notification_invocation_budget');
  budget.external++;
  return fetch(url,{...options,redirect:options.redirect||'error',signal:options.signal||AbortSignal.timeout(8000)});
}
export function notificationDatabase(database,budget){
  function spend(count=1){if(budget.d1+count>budget.maxD1)throw new Error('notification_invocation_budget');budget.d1+=count;}
  function statement(value){return{bind(...args){return statement(value.bind(...args));},async first(...args){spend();return value.first(...args);},async all(...args){spend();return value.all(...args);},async run(...args){spend();return value.run(...args);},rawStatement:value};}
  return{prepare(sql){return statement(database.prepare(sql));},async batch(statements){spend(statements.length);return database.batch(statements.map(s=>s.rawStatement));}};
}
