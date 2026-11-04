import { bearerCode, publicMutation } from './_mutation.js';
export { onRequestOptions } from './_mutation.js';
export const onRequestPost = publicMutation('register_referral_click', (input) => bearerCode(input.referral_code) ? { p_code: bearerCode(input.referral_code) } : null, (row) => ({ valid: row.valid === true, code: bearerCode(row.code) }));
