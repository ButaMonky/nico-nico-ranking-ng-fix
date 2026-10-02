import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {root,sourceParts} from '../build.mjs';
// These are ordered source fragments in one existing closure, not standalone
// ES modules. Read the exact same bytes and order that the product build uses.
export const autofillParts=sourceParts.filter(part=>part.startsWith('src/autofill/'));
export async function readAutoFillSource(){
 return Buffer.concat(await Promise.all(autofillParts.map(part=>readFile(resolve(root,part))))).toString('utf8');
}
