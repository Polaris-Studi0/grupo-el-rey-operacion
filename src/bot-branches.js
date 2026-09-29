const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const aliases = {
  b1: ['aures', 'robledo aures'], b2: ['calle 80', 'diamante calle 80'],
  b3: ['santa cruz'], b4: ['san gabriel', 'itagui'], b5: ['diagonal 85', 'diamante diagonal 85'],
  b6: ['floresta'], b7: ['la 80'], b8: ['la estrella'], b9: ['campo valdez', 'campo valdes'],
  b10: ['san antonio de prado', 'san antonio prado', 'prado']
};
export const orderedBranches = branches => [...branches].sort((a,b) => Number(a.id.slice(1))-Number(b.id.slice(1)));
export function branchSelection(body, branches, options = []) {
  const value = normalize(body);
  const tag = /\[SEDE:([^\]]+)\]/i.exec(body || '');
  const number = /^(?:la |sede |opcion )?(\d{1,2})$/.exec(value);
  if (number && options[Number(number[1])-1]) return {selected: branches.find(b => b.id === options[Number(number[1])-1])};
  const input = tag ? normalize(tag[1]) : value;
  const matched = branches.filter(b => input === b.id || [normalize(b.name), ...(aliases[b.id] || [])].some(a => input === a || ` ${input} `.includes(` ${a} `)));
  // Prefer an exact name/alias; "La 80" must not steal "Robledo Diamante Calle 80".
  const exact = matched.filter(b => [normalize(b.name), ...(aliases[b.id] || [])].includes(input));
  const found = exact.length ? exact : matched;
  if (found.length === 1) return {selected: found[0]};
  if (found.length > 1) return {choices: orderedBranches(found)};
  const ambiguous = branches.filter(b => ['robledo','diamante'].some(word => new RegExp(`\\b${word}\\b`).test(input) && normalize(b.name).includes(word)));
  return {choices: orderedBranches(ambiguous.length ? ambiguous : branches)};
}
export function branchMenu(branches) {
  return '¿En cuál sede te atendemos? Puedes responder con el nombre o el número de la lista:\n\n' + branches.map((b,i) => `${i+1}. ${b.name}`).join('\n');
}
export function stockClosingTime(confirmedAt) {
  const confirmed = Date.parse(confirmedAt);
  if (!Number.isFinite(confirmed)) return 0;
  const localDate = new Date(confirmed - 5*3600000).toISOString().slice(0,10);
  return Date.parse(`${localDate}T20:00:00-05:00`);
}
