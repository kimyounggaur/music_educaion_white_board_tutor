import {build} from 'esbuild';
import {readFileSync,writeFileSync} from 'node:fs';
const root=new URL('./',import.meta.url);
const result=await build({entryPoints:[new URL('main.js',root).pathname],bundle:true,format:'iife',target:'es2020',minify:true,write:false,legalComments:'none'});
const font=readFileSync(new URL('../../assets/Gaegu-Bold.woff2',root)).toString('base64');
const css=`@font-face{font-family:WhiteboardHand;src:url(data:font/woff2;base64,${font}) format("woff2");font-weight:700}`+readFileSync(new URL('style.css',root),'utf8');
const html=readFileSync(new URL('shell.html',root),'utf8').replace('/*__STYLE__*/',()=>css).replace('/*__SCRIPT__*/',()=>result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script'));
writeFileSync(new URL('index.html',root),html);console.log('prototypes/rhythm/index.html · '+Buffer.byteLength(html)+' bytes');
