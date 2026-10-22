import type {TermCard} from './term-card-export';
export function createTermStudyPdf(cards:readonly TermCard[],origin:string,locale?:'zh'|'ja'|'en',now?:Date,fontPath?:string):Promise<Buffer>;
