import assert from 'node:assert/strict'
import { test } from 'node:test'
import { regionsFromRuns } from '../src/client/translation/regions'
import { layoutReflowDocument } from '../src/client/translation/layout'
import { paragraphFromCharacters } from '../src/client/translation/extract'
import { translateParagraph } from '../src/client/translation/translate-paragraph'
import { validReflowTranslation, type Paragraph, type CharacterStyle } from '../src/client/translation/types'
const style: CharacterStyle = { font:'Times', size:12,bold:false,italic:false,color:{r:0,g:0,b:0} }
const paragraph: Paragraph = {id:'p',pageIndex:0,box:{x:20,y:30,w:240,h:90},characters:[],formulas:[{id:'0',text:'x+y',box:{x:80,y:30,w:25,h:12},characterIndexes:[1],baselineOffset:0}],styles:{'0':{...style,bold:true}},source:'Before x+y bold text after.',protectedText:'Before ⟪F0⟫ ⟪S0⟫bold text⟪/S0⟫ after.',style,firstLineIndent:0,heading:false,fixedBox:true}
const signal=()=>new AbortController().signal

test('style reordering reproduces reported failure and protected spans repairs it', async()=>{
 let calls=0
 const result=await translateParagraph(paragraph,async source=>{calls++; return calls===1?'之前 ⟪F0⟫ ⟪/S0⟫粗体⟪S0⟫之后。':source.includes('bold')?'粗体文本':'译文'},signal())
 assert.ok(validReflowTranslation(paragraph,result)); assert.ok(result.includes('⟪S0⟫粗体文本⟪/S0⟫'));assert.equal(calls,4)
})
test('missing formula is restored without sending formula tags back to the model',async()=>{
 const calls:string[]=[]
 const result=await translateParagraph(paragraph,async source=>{calls.push(source);return '译文'},signal())
 assert.ok(validReflowTranslation(paragraph,result));assert.ok(calls.slice(1).every(s=>!s.includes('⟪')))
})
test('cancellation never paints a late translation or launches repairs',async()=>{
 const controller=new AbortController(); let calls=0
 await assert.rejects(translateParagraph(paragraph,async()=>{calls++;controller.abort();return 'bad'},controller.signal),{name:'AbortError'})
 assert.equal(calls,1)
})
test('valid protected translation only costs one request',async()=>{
 let calls=0;const result=await translateParagraph(paragraph,async text=>{calls++;return text},signal())
 assert.equal(result,paragraph.protectedText);assert.equal(calls,1)
})
test('two-column fallback regions do not combine neighboring columns',()=>{
 const run=(text:string,x:number,y:number)=>({text,rect:{origin:{x,y},size:{width:200,height:12}},font:{name:'Times',familyName:'Times',weight:400,italic:false,monospaced:false,embedded:true},fontSize:12,color:{red:0,green:0,blue:0,alpha:255},charIndex:0,charCount:text.length})
 const regions=regionsFromRuns([run('First line.',40,50),run('Right line.',340,50),run('Second line.',40,66),run('Next right.',340,66)],0,612,792)
 assert.equal(regions.length,2);assert.ok(regions.every(r=>r.rect.w===200));assert.equal(regions[0].rect.h,28)
})
test('character extraction protects formulas and font changes',()=>{
 const text='Model x+y is bold.'
 const chars=Array.from(text,(text,index)=>({index,text,box:{x:20+index*7,y:30,w:7,h:12},visualBox:{x:20+index*7,y:30,w:7,h:12},style:{...style,...(index>=13?{bold:true}:{}),...(index>=6&&index<=8?{font:'CMMI'}:{})}}))
 const p=paragraphFromCharacters('p',0,{x:20,y:30,w:150,h:15},chars,[],false)
 assert.ok(p.formulas.length>0);assert.ok(Object.keys(p.styles).length>0);assert.ok(validReflowTranslation(p,p.protectedText))
})
test('motif fitting keeps translated units within fixed region and preserves formula raster size ratio',()=>{
 const font={encodeText:()=>'',widthOfTextAtSize:(_t:string,s:number)=>s*.8,heightAtSize:(s:number,options?:{descender:boolean})=>s*(options?.descender===false?.8:1)}
 const fonts={regular:font,bold:font,italic:font,boldItalic:font,cjk:font,cjkBold:font}
 const p={...paragraph,box:{x:20,y:30,w:100,h:50}}
 const text='译文'.repeat(25)+'⟪F0⟫⟪S0⟫粗体⟪/S0⟫'
 const layout=layoutReflowDocument({version:1,pages:[{index:0,width:612,height:792,paragraphs:[p],obstacles:[]}]},new Map([['p',text]]),fonts)[0]!.paragraphs[0]!
 assert.ok(layout.fits);assert.ok(layout.scale<1);assert.deepEqual(layout.box,p.box)
 const formula=layout.units.find(u=>u.formula)!;assert.equal(formula.width,25*layout.scale)
 assert.ok(layout.units.every(u=>u.y<=80.01))
})
