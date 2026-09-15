// A conservative display filter, not a classifier of speaker intent.
const replacements = [
  ['ไอ้เหี้ย', 'ไอ้เหี้*'], ['อีเหี้ย', 'อีเหี้*'],
  ['ไอ้สัส', 'ไอ้สั*'], ['ไอ้สัตว์', 'ไอ้สั**'],
  ['ไอ้ควาย', 'ไอ้คว**'], ['อีดอก', 'อีด**'],
  ['เย็ดแม่', 'เย็*แม่'], ['แม่ง', 'แม่*'], ['ควย', 'ค**']
];
export function censorText(text, mode = 'partial') {
  if (mode !== 'partial' || typeof text !== 'string') return text;
  let result = text;
  for (const [word, masked] of replacements) result = result.split(word).join(masked);
  return result.replace(/\b(fuck(?:ing|er|ed)?|shit|bitch|asshole)\b/gi, word => word[0] + '*'.repeat(word.length - 1));
}
export function censorRegions(regions, mode = 'partial') {
  return regions.map(region => ({...region, text: censorText(region.text, mode), original: censorText(region.original, mode)}));
}
