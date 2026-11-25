// Listino di base: lavori principali con prezzi medi indicativi per un'impresa della zona di Rimini (novembre 2026).
// Fonti: medie di mercato pubblicate (Studio Madera, Idealista, Wikicasa, Money.it, QuiFinanza) e prezzari regionali 2025;
// valori a metà delle forbici trovate, leggermente sopra la media per la Riviera. Prezzi IVA esclusa, da verificare.
// Ogni voce resta «indicativa» finché il titolare non la modifica.
const V = (id, categoria, desc, um, prezzo) => ({ id, categoria, desc, um, prezzo, indicativo: true, fonte: 'Prezzi medi zona Rimini 2026' });

export const LISTINO_RIMINI = [
  // Cantiere
  V('r001', 'Cantiere', 'Allestimento cantiere, protezioni di pavimenti e arredi, pulizia giornaliera', 'a corpo', 350),
  V('r002', 'Cantiere', 'Ponteggio di facciata: montaggio, primo mese di noleggio e smontaggio', 'mq', 26),
  V('r003', 'Cantiere', 'Noleggio ponteggio, ogni mese successivo al primo', 'mq', 4),
  V('r004', 'Cantiere', 'Assistenza muraria agli impianti (tracce, ripristini, aiuto agli impiantisti)', 'a corpo', 800),

  // Demolizioni e rimozioni
  V('r010', 'Demolizioni e rimozioni', 'Demolizione di pavimento in piastrelle con relativo sottofondo', 'mq', 16),
  V('r011', 'Demolizioni e rimozioni', 'Rimozione di rivestimento in piastrelle a parete', 'mq', 13),
  V('r012', 'Demolizioni e rimozioni', 'Demolizione di massetto porta-impianti fino a 8 cm', 'mq', 16),
  V('r013', 'Demolizioni e rimozioni', 'Demolizione di tramezzi in laterizio forato fino a 12 cm', 'mq', 22),
  V('r014', 'Demolizioni e rimozioni', 'Rimozione di sanitari, rubinetterie e accessori del bagno', 'cad', 45),
  V('r015', 'Demolizioni e rimozioni', 'Rimozione di porte interne con telaio', 'cad', 40),
  V('r016', 'Demolizioni e rimozioni', 'Rimozione di intonaco ammalorato fino al vivo della muratura', 'mq', 18),
  V('r017', 'Demolizioni e rimozioni', 'Rimozione di controsoffitto esistente', 'mq', 12),

  // Smaltimento e pulizia
  V('r020', 'Smaltimento e pulizia', 'Carico, trasporto e smaltimento macerie in discarica autorizzata', 'mc', 110),
  V('r021', 'Smaltimento e pulizia', 'Noleggio cassone per macerie con trasporto e smaltimento', 'cad', 450),
  V('r022', 'Smaltimento e pulizia', 'Pulizia finale del cantiere', 'a corpo', 280),

  // Murature e intonaci
  V('r030', 'Murature e intonaci', 'Tramezzo in laterizio forato da 8 cm, intonacato su due lati', 'mq', 60),
  V('r031', 'Murature e intonaci', 'Intonaco civile per interni, rinzaffo, arriccio e finitura', 'mq', 28),
  V('r032', 'Murature e intonaci', 'Ripristino di intonaco su piccole superfici e tracce', 'mq', 35),
  V('r033', 'Murature e intonaci', 'Apertura di vano porta in muratura con architrave', 'cad', 950),
  V('r034', 'Murature e intonaci', 'Chiusura di vano porta o finestra in laterizio', 'mq', 75),

  // Massetti e pavimenti
  V('r040', 'Massetti e pavimenti', 'Massetto in sabbia e cemento, spessore medio 5 cm', 'mq', 24),
  V('r041', 'Massetti e pavimenti', 'Massetto alleggerito per coprire gli impianti, spessore fino a 8 cm', 'mq', 28),
  V('r042', 'Massetti e pavimenti', 'Autolivellante per pavimenti, spessore fino a 5 mm', 'mq', 15),
  V('r043', 'Massetti e pavimenti', 'Posa di pavimento in gres porcellanato fino a 60×60, collante compreso (materiale escluso)', 'mq', 35),
  V('r044', 'Massetti e pavimenti', 'Posa di pavimento in grande formato (oltre 60×60), collante compreso (materiale escluso)', 'mq', 45),
  V('r045', 'Massetti e pavimenti', 'Posa di pavimento in parquet o laminato (materiale escluso)', 'mq', 25),
  V('r046', 'Massetti e pavimenti', 'Fornitura di gres porcellanato di fascia media', 'mq', 32),
  V('r047', 'Massetti e pavimenti', 'Battiscopa in gres o legno, fornitura e posa', 'ml', 12),
  V('r048', 'Massetti e pavimenti', 'Soglia o davanzale in marmo, fornitura e posa', 'ml', 85),

  // Rivestimenti
  V('r050', 'Rivestimenti', 'Posa di rivestimento in ceramica a parete, collante compreso (materiale escluso)', 'mq', 40),
  V('r051', 'Rivestimenti', 'Impermeabilizzazione zona doccia con guaina liquida e bandelle', 'mq', 30),
  V('r052', 'Rivestimenti', 'Fornitura di rivestimento in ceramica di fascia media', 'mq', 30),
  V('r053', 'Rivestimenti', 'Profili angolari in alluminio o acciaio, fornitura e posa', 'ml', 14),

  // Bagno
  V('r060', 'Bagno', 'Rifacimento completo bagno fino a 5 mq, finiture medie (impianti, piastrelle, sanitari compresi)', 'a corpo', 9500),
  V('r061', 'Bagno', 'Piatto doccia filo pavimento, fornitura e posa', 'cad', 550),
  V('r062', 'Bagno', 'Box doccia in cristallo, fornitura e montaggio', 'cad', 650),
  V('r063', 'Bagno', 'Montaggio sanitari sospesi (wc e bidet) con cassetta a incasso', 'cad', 380),
  V('r064', 'Bagno', 'Montaggio mobile bagno con lavabo e rubinetteria', 'cad', 180),
  V('r065', 'Bagno', 'Sostituzione vasca con doccia (smontaggio, piatto, rivestimento, box)', 'a corpo', 3200),

  // Impianto idraulico
  V('r070', 'Impianto idraulico', 'Rifacimento impianto idraulico bagno, adduzione e scarichi', 'a corpo', 2400),
  V('r071', 'Impianto idraulico', 'Rifacimento impianto idraulico cucina', 'a corpo', 1100),
  V('r072', 'Impianto idraulico', 'Punto acqua calda e fredda con scarico, sottotraccia', 'cad', 190),
  V('r073', 'Impianto idraulico', 'Collettore idrico e linee di distribuzione dell\'appartamento', 'a corpo', 1500),

  // Impianto elettrico
  V('r080', 'Impianto elettrico', 'Rifacimento impianto elettrico appartamento fino a 80 mq, a norma, con certificazione', 'a corpo', 6500),
  V('r081', 'Impianto elettrico', 'Punto luce sottotraccia completo di frutto e placca', 'cad', 75),
  V('r082', 'Impianto elettrico', 'Punto presa sottotraccia completo di frutto e placca', 'cad', 65),
  V('r083', 'Impianto elettrico', 'Quadro elettrico con interruttori differenziali e magnetotermici', 'cad', 750),
  V('r084', 'Impianto elettrico', 'Punto TV o rete dati sottotraccia', 'cad', 85),

  // Cartongesso
  V('r090', 'Cartongesso', 'Parete divisoria in cartongesso, doppia lastra per lato, con isolante', 'mq', 70),
  V('r091', 'Cartongesso', 'Controparete in cartongesso con isolante', 'mq', 45),
  V('r092', 'Cartongesso', 'Controsoffitto in cartongesso su orditura metallica', 'mq', 40),
  V('r093', 'Cartongesso', 'Veletta in cartongesso con predisposizione per strip LED', 'ml', 60),
  V('r094', 'Cartongesso', 'Nicchia in cartongesso per bagno o soggiorno', 'cad', 220),

  // Tinteggiatura
  V('r100', 'Tinteggiatura', 'Tinteggiatura pareti e soffitti con idropittura traspirante, due mani', 'mq', 9),
  V('r101', 'Tinteggiatura', 'Tinteggiatura con pittura lavabile, due mani', 'mq', 11),
  V('r102', 'Tinteggiatura', 'Rasatura completa delle pareti a gesso, pronta per la tinteggiatura', 'mq', 16),
  V('r103', 'Tinteggiatura', 'Stuccatura e carteggiatura di piccole imperfezioni', 'mq', 5),
  V('r104', 'Tinteggiatura', 'Trattamento antimuffa con risanante e pittura specifica', 'mq', 15),
  V('r105', 'Tinteggiatura', 'Verniciatura di ringhiere o cancellate in ferro', 'mq', 28),

  // Copertura
  V('r110', 'Copertura', 'Rifacimento manto di copertura in coppi o tegole con guaina impermeabile', 'mq', 110),
  V('r111', 'Copertura', 'Rifacimento completo tetto ventilato, senza interventi strutturali', 'mq', 250),
  V('r112', 'Copertura', 'Isolamento della copertura con pannelli, spessore 10 cm', 'mq', 45),
  V('r113', 'Copertura', 'Impermeabilizzazione con guaina bituminosa ardesiata', 'mq', 32),
  V('r114', 'Copertura', 'Grondaie e pluviali in rame o lamiera, fornitura e posa', 'ml', 55),
  V('r115', 'Copertura', 'Ricerca e riparazione di infiltrazione sul tetto', 'a corpo', 450),

  // Facciate e balconi
  V('r120', 'Facciate e balconi', 'Cappotto termico in EPS grafitato 10 cm, rasato e finito', 'mq', 105),
  V('r121', 'Facciate e balconi', 'Tinteggiatura facciata con pittura ai silossani, due mani', 'mq', 22),
  V('r122', 'Facciate e balconi', 'Ripristino di intonaco esterno ammalorato', 'mq', 45),
  V('r123', 'Facciate e balconi', 'Ripristino frontalini e sottobalconi con malta strutturale', 'ml', 75),
  V('r124', 'Facciate e balconi', 'Impermeabilizzazione di balcone o terrazzo con guaina liquida', 'mq', 40),
  V('r125', 'Facciate e balconi', 'Rifacimento pavimento del balcone, impermeabilizzazione compresa', 'mq', 110),

  // Sottotetti e ampliamenti
  V('r130', 'Sottotetti e ampliamenti', 'Recupero sottotetto: isolamento, cartongesso e finiture', 'mq', 450),
  V('r131', 'Sottotetti e ampliamenti', 'Lucernario per tetto, fornitura e posa', 'cad', 1100),

  // Manutenzione e piccoli lavori
  V('r140', 'Manutenzione e piccoli lavori', 'Manodopera operaio specializzato', 'h', 38),
  V('r141', 'Manutenzione e piccoli lavori', 'Manodopera operaio comune', 'h', 32),
  V('r142', 'Manutenzione e piccoli lavori', 'Sopralluogo e piccola riparazione', 'a corpo', 120)
];

/**
 * Cosa scrivere e cosa eliminare per caricare il listino di Rimini senza toccare il lavoro del titolare:
 * - voci di base nuove → aggiunte; voci di base ancora «indicative» → aggiornate;
 * - voci modificate dal titolare (non più indicative), voci dai PDF e voci sue → lasciate come sono;
 * - vecchie voci indicative di esempio (id l01…) non più nel listino di base → eliminate;
 * - una voce di base con la stessa descrizione di una già presente non viene duplicata.
 */
export function pianoListino(esistenti) {
  const base = new Map(LISTINO_RIMINI.map(v => [v.id, v]));
  const perId = new Map(esistenti.map(v => [v.id, v]));
  const descr = new Set(esistenti.filter(v => !base.has(v.id) || !v.indicativo).map(v => (v.desc || '').trim().toLowerCase()));
  const scrivi = [], elimina = [];
  let tenute = 0;
  for (const v of esistenti) {
    if (base.has(v.id)) continue;
    if (v.indicativo === true && /^l\d+$/.test(v.id)) elimina.push(v.id); else tenute++;
  }
  for (const v of LISTINO_RIMINI) {
    const ex = perId.get(v.id);
    if (ex && ex.indicativo !== true) { tenute++; continue; }
    if (!ex && descr.has(v.desc.trim().toLowerCase())) continue;
    if (ex && ex.desc === v.desc && ex.um === v.um && ex.prezzo === v.prezzo && ex.categoria === v.categoria) continue;
    scrivi.push({ ...v });
  }
  return { scrivi, elimina, tenute };
}
