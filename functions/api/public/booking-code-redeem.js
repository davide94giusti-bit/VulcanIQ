import { bearerCode, publicMutation, redemptionResult } from './_mutation.js';
export { onRequestOptions } from './_mutation.js';
export const onRequestPost = publicMutation('redeem_booking_code', (input) => bearerCode(input.booking_code) ? { p_code: bearerCode(input.booking_code), p_language: input.language === 'en' ? 'en' : 'it' } : null, redemptionResult);
