import {messages} from './translations.js';
import {categoryLabel} from './search-terms.js';
export const LANGUAGE_KEY='dojo-atlas.language.v1';
export const languages={en:'English',pt:'Português',es:'Español',fr:'Français',de:'Deutsch',it:'Italiano',nl:'Nederlands',pl:'Polski',ru:'Русский',uk:'Українська',tr:'Türkçe',ar:'العربية',hi:'हिन्दी',ja:'日本語',zh:'中文',ko:'한국어',id:'Bahasa Indonesia',vi:'Tiếng Việt'};
let language='en',locale='en',choice='auto';
const originalText=new WeakMap(),originalAttributes=new WeakMap();
export function resolveLanguage(preferences=[],override='auto'){
 if(override!=='auto'&&Object.hasOwn(languages,override))return {language:override,locale:override};
 for(const value of preferences){try{const tag=Intl.getCanonicalLocales(String(value).replaceAll('_','-'))[0],base=tag.split('-')[0];if(Object.hasOwn(languages,base))return {language:base,locale:tag}}catch{}}
 return {language:'en',locale:'en'};
}
export function getLanguage(){return language}
export function t(source,values={}){let result=messages[language]?.[source]??messages.en[source]??source;return result.replace(/\{(\w+)\}/g,(match,key)=>values[key]===undefined?match:String(values[key]))}
export function errorMessage(value,fallback='A operação falhou.'){return typeof value==='string'&&(Object.hasOwn(messages.en,value)||language==='pt')?t(value):t(fallback)}
export const number=value=>new Intl.NumberFormat(locale).format(value);
export const date=value=>new Intl.DateTimeFormat(locale).format(new Date(value));
export const categoryText=name=>categoryLabel(name,language);
export function translateStatic(root=document){
 const walker=document.createTreeWalker(root,4);let node;
 while((node=walker.nextNode())){if(['SCRIPT','STYLE'].includes(node.parentElement?.tagName)||node.parentElement?.closest('[data-original]'))continue;if(!originalText.has(node))originalText.set(node,node.nodeValue);const original=originalText.get(node),key=original.trim();if(messages.en[key])node.nodeValue=original.replace(key,t(key))}
 for(const element of root.querySelectorAll('[placeholder],[aria-label],[title]')){if(!originalAttributes.has(element))originalAttributes.set(element,Object.fromEntries(['placeholder','aria-label','title'].filter(key=>element.hasAttribute(key)).map(key=>[key,element.getAttribute(key)])));for(const [attribute,value]of Object.entries(originalAttributes.get(element)))if(messages.en[value])element.setAttribute(attribute,t(value))}
}
function selectLanguage(){
 const preferences=window.navigator.languages?.length?window.navigator.languages:[window.navigator.language],resolved=resolveLanguage(preferences,choice);language=resolved.language;locale=resolved.locale;
 document.documentElement.lang=locale;document.documentElement.dir=language==='ar'?'rtl':'ltr';translateStatic();
 const select=document.querySelector('#language');if(select){select.replaceChildren(...[['auto',t('Automático (navegador)')],...Object.entries(languages)].map(([value,label])=>{const option=document.createElement('option');option.value=value;option.textContent=label;option.lang=value==='auto'?locale:value;return option}));select.value=choice}
}
export function setLanguage(value){choice=value==='auto'||Object.hasOwn(languages,value)?value:'auto';try{if(choice==='auto')localStorage.removeItem(LANGUAGE_KEY);else localStorage.setItem(LANGUAGE_KEY,choice)}catch{}selectLanguage();window.dispatchEvent(new window.CustomEvent('site-language-change'))}
export function initI18n(){
 choice='auto';
 try{const stored=localStorage.getItem(LANGUAGE_KEY);if(stored&&Object.hasOwn(languages,stored))choice=stored}catch{}
 // Preserve form values even when the visible option text is translated.
 for(const option of document.querySelectorAll('option:not([value])'))option.value=option.textContent;
 selectLanguage();const select=document.querySelector('#language');if(select)select.onchange=()=>setLanguage(select.value);
 window.addEventListener('languagechange',()=>{if(choice==='auto'){selectLanguage();window.dispatchEvent(new window.CustomEvent('site-language-change'))}});
}
