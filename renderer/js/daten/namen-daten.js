/**
 * Skularis — Namensdaten für den Zufalls-Namensgenerator (Aventurien/Ilaris-Stil).
 *
 * Vornamen sind nach "Herkunft" geordnet: bei Menschen (und Halbmenschen) nach
 * Kultur, bei den übrigen Spezies nach Spezies. Nachnamen/Beinamen sind optional.
 * Alles handkuratiert und bewusst mit echten Umlauten (korrekte Sprachausgabe).
 */

export const SPEZIES = ['Mensch', 'Elf', 'Halbelf', 'Zwerg', 'Ork', 'Goblin', 'Achaz', 'Halbork'];

export const KULTUREN = ['Mittelreich', 'Bornland', 'Horasreich', 'Tulamidenlande', 'Thorwal', 'Maraskan', 'Südaventurien'];

// Vornamen je Herkunftsschlüssel: { m: [...männlich], w: [...weiblich] }
export const VORNAMEN = {
  Mittelreich: {
    m: ['Alrik', 'Praiodan', 'Gerbald', 'Hilbrecht', 'Answin', 'Roban', 'Emmeran', 'Growin', 'Konrad', 'Waldemar', 'Bosper', 'Tsadan'],
    w: ['Alrike', 'Hilbra', 'Irmenella', 'Rewena', 'Jadwiga', 'Gwendala', 'Mechthild', 'Praiodane', 'Yaneka', 'Cella', 'Fylja', 'Bragona'],
  },
  Bornland: {
    m: ['Adolar', 'Bjelka', 'Radomil', 'Stoerrebrand', 'Wenzel', 'Jarl', 'Ludwig', 'Ottokar', 'Bogdan', 'Sewerin'],
    w: ['Ludmilla', 'Wanja', 'Bragoslawa', 'Katrescha', 'Olga', 'Sanya', 'Wildera', 'Marja', 'Dobra', 'Jelena'],
  },
  Horasreich: {
    m: ['Cordovan', 'Fedora', 'Amando', 'Luciano', 'Belengar', 'Ysander', 'Dexter', 'Florian', 'Servan', 'Aldare'],
    w: ['Yolande', 'Belissa', 'Coreija', 'Minaria', 'Ysalinde', 'Aventina', 'Florentine', 'Serafine', 'Adessa', 'Mirhban'],
  },
  Tulamidenlande: {
    m: ['Abu Dhelrumun', 'Hasrabal', 'Selim', 'Malik', 'Rashid', 'Nurhan', 'Firuz', 'Kasim', 'Tarik', 'Omar'],
    w: ['Yasmina', 'Salima', 'Leyla', 'Fatima', 'Djamila', 'Rahjaneri', 'Sahra', 'Nadja', 'Halima', 'Zaida'],
  },
  Thorwal: {
    m: ['Asleif', 'Beorn', 'Gerbjörn', 'Halvar', 'Sven', 'Torben', 'Ragnar', 'Snorri', 'Erik', 'Yasgrimm'],
    w: ['Alva', 'Freydis', 'Gudrun', 'Ingra', 'Sigrid', 'Thora', 'Yldrid', 'Astrid', 'Helga', 'Ragna'],
  },
  Maraskan: {
    m: ['Bakramin', 'Direon', 'Jaman', 'Kramin', 'Rendibar', 'Turon', 'Wanjason', 'Girkan', 'Sanjo', 'Melchar'],
    w: ['Aureliana', 'Dariah', 'Jamane', 'Kramine', 'Sanja', 'Turlane', 'Wanjana', 'Girke', 'Melcha', 'Bahiya'],
  },
  Südaventurien: {
    m: ['Boronian', 'Dajin', 'Feliciano', 'Marbo', 'Nardo', 'Ophirian', 'Rugant', 'Salpikan', 'Vasco', 'Zornbrecht'],
    w: ['Boronia', 'Dajane', 'Felicia', 'Marbina', 'Nardana', 'Ophira', 'Rahjalind', 'Salpica', 'Vascaya', 'Zorne'],
  },
  // --- Spezies (nicht-menschlich) ---
  Elf: {
    m: ['Fenwas', 'Quenyan', 'Aldaril', 'Nurinja', 'Tirinjo', 'Alwardin', 'Faramin', 'Yberion', 'Suvinja', 'Loriael'],
    w: ['Faraya', 'Quintessa', 'Alaya', 'Nurja', 'Tirinja', 'Alwelia', 'Farinja', 'Yberia', 'Suvinja', 'Loriel'],
  },
  Zwerg: {
    m: ['Angrax', 'Brogar', 'Durnwin', 'Grimbrax', 'Orsox', 'Thargunitoth', 'Xnafft', 'Brazoragh', 'Umbrax', 'Grombald'],
    w: ['Angra', 'Brogna', 'Durna', 'Grimhild', 'Orsa', 'Thargra', 'Xnaffa', 'Brazona', 'Umbra', 'Grombra'],
  },
  Ork: {
    m: ['Gnarrk', 'Ograk', 'Brogh', 'Urshak', 'Grumsh', 'Krazz', 'Durbak', 'Hrogg', 'Skarnak', 'Gorbash'],
    w: ['Wrogga', 'Trakscha', 'Blarga', 'Mokosha', 'Ushtara', 'Grimza', 'Snagra', 'Uzruka', 'Kruscha', 'Zhaka'],
  },
  Goblin: {
    m: ['Znak', 'Rukzod', 'Mogruk', 'Wanzenbeisser', 'Kruschak', 'Zhak', 'Nazgrat', 'Grabsch', 'Fiezz', 'Muckl'],
    w: ['Zna', 'Rukza', 'Mogra', 'Fieze', 'Kruscha', 'Zhaka', 'Grabscha', 'Muckla', 'Ninz', 'Wupp'],
  },
  Achaz: {
    m: ['Sisstsza', 'Kraskss', 'Hstaszt', 'Rasszik', 'Ssanuk', 'Tzaszk', 'Ksirr', 'Sseptek', 'Rrasch', 'Zzhak'],
    w: ['Sssaya', 'Kraska', 'Hstaya', 'Rasszka', 'Ssanka', 'Tzaya', 'Ksirra', 'Ssepta', 'Rrascha', 'Zzha'],
  },
};

// Nachnamen/Beinamen je Herkunftsschlüssel (optional; leere Liste = nur Vorname).
export const NACHNAMEN = {
  Mittelreich: ['von Gareth', 'Eslamsroth', 'vom Berg', 'Brenningson', 'Sturmfels', 'aus Elenvina', 'Kohlenbrenner', 'von der Wiesen'],
  Bornland: ['Fuxfaenger', 'Notmarker', 'von Ilmenstein', 'Bärenwald', 'Sewerjason', 'aus Festum', 'Sumpfwiesen'],
  Horasreich: ['di Vinsalt', 'von Kuslik', 'del Belhanka', 'Perlenkette', 'di Fasarel', 'aus Grangor'],
  Tulamidenlande: ['ibn Rashid', 'al Khunchom', 'aus Fasar', 'ben Malik', 'al Mhanadi', 'aus Zorgan'],
  Thorwal: ['Asleifson', 'Svenja', 'die Rote', 'Sturmreiter', 'aus Prem', 'Walfänger', 'Hjalding'],
  Maraskan: ['aus Jergan', 'Zweiklinge', 'von Boran', 'Reispflücker', 'aus Sinoda'],
  Südaventurien: ['di Al Anfa', 'Schwarzhand', 'aus Brabak', 'von Charypso', 'Perlentaucher'],
  Elf: ['vom Silberbach', 'Windläufer', 'Sternensinger', 'vom Alten Wald', 'Mondfeder'],
  Zwerg: ['Sohn des Angbar', 'aus dem Koschgebirge', 'Erzfaust', 'Eisenbart', 'Amboßschläger', 'Tiefengräber'],
  Ork: ['vom Blutklan', 'Schädelspalter', 'der Wolf', 'Sippe der Roten Klaue'],
  Goblin: [],
  Achaz: ['aus dem Echsensumpf', 'vom Schlangenfluss'],
};

function pick(arr) {
  if (!arr || !arr.length) return '';
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Schlüssel für die Namenspools: Menschen nach Kultur, sonst nach Spezies. */
export function herkunftsSchluessel(spezies, kultur) {
  if (spezies === 'Mensch' || spezies === 'Halbelf' || spezies === 'Halbork') return kultur;
  return spezies;
}

/**
 * Einen Namen erwürfeln.
 * @param {string} spezies
 * @param {string} kultur
 * @param {'maennlich'|'weiblich'} geschlecht
 * @returns {string}
 */
export function wuerfleName(spezies, kultur, geschlecht) {
  const key = herkunftsSchluessel(spezies, kultur);
  const pool = VORNAMEN[key] || VORNAMEN[kultur] || VORNAMEN.Mittelreich;
  const g = geschlecht === 'weiblich' ? 'w' : 'm';
  const vorname = pick(pool[g] && pool[g].length ? pool[g] : pool.m);
  // Halbelfen/Halborks dürfen auch einen Beinamen ihrer nicht-menschlichen Seite
  // tragen; der Einfachheit halber nehmen wir den kulturellen Nachnamen.
  const nach = pick(NACHNAMEN[key] || NACHNAMEN[kultur] || []);
  return nach ? `${vorname} ${nach}` : vorname;
}
