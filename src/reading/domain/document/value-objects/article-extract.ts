/** The extraction contract every article reader fills: HTML body → bounded text. */
export type ArticleExtract = (
  body: string,
  url: string,
  maxChars?: number,
) => { content: string; title: string };
