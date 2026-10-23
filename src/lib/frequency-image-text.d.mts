export interface ImageText {key:string;field:'passage'|'prompt';text:string}
export interface ReviewedImage {key:string;text:string;sha256:string;reviewed:true}
export function createImageTextIndex(input:unknown): Map<string,ReviewedImage>;
export function questionImageReferences(question:{category:string;media?:{images:readonly string[];questionImages?:readonly string[]}}): {key:string;field:'passage'|'prompt'}[];
export function withFrequencyImageText<T extends {category:string;media?:{images:readonly string[];questionImages?:readonly string[]}}>(question:T,index:Map<string,ReviewedImage>): T & {imageTexts:ImageText[]};
