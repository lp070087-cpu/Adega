export function portalMailReady(){try{return Boolean(process.env.RESEND_API_KEY&&process.env.MAIL_FROM&&new URL(process.env.APP_PUBLIC_URL??'').protocol==='https:');}catch{return false;}}
/** E-mail confirmation is required only while a real provider is configured. */
export const portalVerifiedFilter=()=>portalMailReady()?{emailVerifiedAt:{not:null}}:{};
