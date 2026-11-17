import { validateDeck, MAX_FILE_BYTES } from './model.js';
export function encodePresentation(deck) {
  const result=new TextEncoder().encode(JSON.stringify(validateDeck(deck),null,2));
  if(result.byteLength>MAX_FILE_BYTES)throw new Error('The presentation exceeds the 512 MiB file limit.');
  return result;
}
export async function decodePresentation(input) {
  const data=input instanceof Uint8Array?input:new Uint8Array(input);
  if(data.byteLength>MAX_FILE_BYTES)throw new Error('The presentation exceeds the 512 MiB file limit.');
  try{return validateDeck(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data)));}
  catch(error){throw new Error(`Could not open this presentation: ${error.message}`);}
}
