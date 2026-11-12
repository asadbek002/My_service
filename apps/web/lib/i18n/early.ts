export const LANG_KEY = 'ms_lang';

/** Runs before the page paints: hides it until the Russian text is in place (at most a moment). */
// /ru is the Russian home page: opening it also makes Russian this device's choice.
export const earlyScript = `try{var d=document.documentElement;if(/^\\/ru(\\/|$)/.test(location.pathname))localStorage.setItem('${LANG_KEY}','ru');if(localStorage.getItem('${LANG_KEY}')==='ru'){d.lang='ru';d.setAttribute('data-i18n','pending');setTimeout(function(){d.removeAttribute('data-i18n')},1500)}}catch(e){}`;
