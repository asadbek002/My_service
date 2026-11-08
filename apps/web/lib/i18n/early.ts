export const LANG_KEY = 'ms_lang';

/** Runs before the page paints: hides it until the Russian text is in place (at most a moment). */
export const earlyScript = `try{if(localStorage.getItem('${LANG_KEY}')==='ru'){var d=document.documentElement;d.lang='ru';d.setAttribute('data-i18n','pending');setTimeout(function(){d.removeAttribute('data-i18n')},1500)}}catch(e){}`;
