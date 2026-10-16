// Animali domestici e d'allevamento (cane, gatto, galline, cavalli…): non sono fauna da vedere.
// Si escludono da "Cosa vedere qui" e dalle liste di specie, anche se iNaturalist li conta (di solito
// sono osservazioni "in cattività"; alle ricerche si chiede anche captive=false).
const SCIENTIFICI =
  /\b(Canis (lupus )?familiaris|Felis (silvestris )?catus|Gallus gallus|Equus (caballus|ferus caballus|asinus|africanus asinus)|Bos (taurus|indicus|primigenius taurus)|Bubalus bubalis|Ovis aries(?! musimon)|Capra (aegagrus )?hircus|Sus (scrofa )?domesticus|Anser (anser|cygnoides) domesticus|Anas platyrhynchos domesticus|Meleagris gallopavo|Oryctolagus cuniculus domesticus|Cavia porcellus|Columba livia domestica|Lama glama|Vicugna pacos)\b/i;
const NOMI = new Set([
  'cane', 'cane domestico', 'gatto', 'gatto domestico', 'gallina', 'gallo', 'gallina domestica', 'pollo', 'cavallo', 'asino', 'mulo', 'mucca', 'vacca', 'bovino', 'toro', 'bue',
  'pecora', 'pecora domestica', 'capra domestica', 'maiale', 'suino', 'tacchino', 'oca domestica', 'anatra domestica', 'coniglio domestico', 'porcellino d\'india', 'lama', 'alpaca',
]);

// { scientifico, nome }: il nome scientifico o quello comune (in italiano) di un taxon
export function eDomestico({ scientifico = '', nome = '' } = {}) {
  return SCIENTIFICI.test(String(scientifico)) || NOMI.has(String(nome).trim().toLowerCase());
}
