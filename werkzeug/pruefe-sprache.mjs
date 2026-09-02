// Sprachen: Deutsch steht im HTML, Tuerkisch und Englisch liegen darueber.
//
// Diese Probe geht beide Richtungen durch, und zwar zweimal:
//
//   ohne Browser   jeder Schluessel im Markup hat eine Uebersetzung in beiden
//                  Sprachen, jede Uebersetzung wird auch benutzt, und die
//                  Platzhalter ({n}, {name}) stimmen ueberein
//   mit Browser    Umschalten aendert wirklich den sichtbaren Text und das
//                  lang-Attribut, die Wahl ueberlebt ein Neuladen - und
//                  **ohne JavaScript bleibt die Seite deutsch und vollstaendig**
//
// Der letzte Punkt ist der wichtigste: die Uebersicht ist der einzige Teil der
// Seite, der auch ohne JS etwas wert ist (doku/startseite.md). Genau deshalb
// steht Deutsch im Markup und nicht in einer Wortliste.
//
//   cd /var/www/html/paare
//   PORT=8087 HOST=127.0.0.1 deno run --allow-net --allow-read --allow-env --allow-sys server.js &
//   cd /root/werkzeug-screenshots && node pruefe-sprache.mjs
//   ss -tlnp | grep ':8087 '   # danach ueber den Port beenden, nie per pkill
//
// Ohne laufendes Paare wird der Spielteil uebersprungen, der Rest laeuft.
// Versioniert in /var/www/html/werkzeug/.

import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const WURZEL = "/var/www/html";
const SPIELE_URL = process.env.SPIELE_URL ?? "https://inf-zeus.de/spiele/";
const START_URL = process.env.START_URL ?? "https://inf-zeus.de/";
const PAARE_URL = process.env.PAARE_URL ?? "http://127.0.0.1:8087/";

let gruen = 0, rot = 0;
const befunde = [];
const pruefe = (ok, text) => {
  if (ok) { gruen++; console.log(`  ok   ${text}`); }
  else { rot++; befunde.push(text); console.error(`  FEHL ${text}`); }
};
const schlaf = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Teil 1: die Woerterbuecher gegen das Markup
// ---------------------------------------------------------------------------

/** Alle Schluessel, die im Markup stehen. */
function ausMarkup(html) {
  const raus = new Set();
  // `data-t="mm.regel.${r}"` steht in einer Zeichenkette im Code: der Schluessel
  // entsteht erst zur Laufzeit. Das Stueck davor ist ein Praefix.
  const roh = (k) => (k.includes("${") ? k.slice(0, k.indexOf("${")) : k);
  for (const m of html.matchAll(/data-t="([^"]+)"/g)) raus.add(roh(m[1]));
  for (const m of html.matchAll(/data-t-html="([^"]+)"/g)) raus.add(roh(m[1]));
  for (const m of html.matchAll(/data-t-attr="([^"]+)"/g)) {
    for (const paar of m[1].split("|")) {
      const doppel = paar.indexOf(":");
      if (doppel > 0) raus.add(paar.slice(doppel + 1).trim());
    }
  }
  return raus;
}

/**
 * Und die aus dem Code: was erst beim Tippen oder Zeichnen entsteht, steht
 * nicht im Markup. Gesucht wird nach `t("…"`, `T("…"` und `k: "…"` - Letzteres
 * ist der Schluessel, den eine Servermeldung mitbringt.
 */
function ausCode(quelle) {
  // Kommentarzeilen raus: dort stehen Beispiele („k: \"p.paar\""), und die
  // sind keine benutzten Schluessel. Ohne das meldet die Probe eine fehlende
  // Uebersetzung fuer einen Schluessel, den es gar nicht gibt.
  const js = quelle
    .split("\n")
    .filter((z) => !/^\s*(\/\/|\*|\/\*)/.test(z))
    .join("\n");
  const raus = new Set();
  // Ein Schluessel hat immer einen Punkt - ohne den faengt das Muster
  // Objektschluessel und Ereignisnamen ein ("pointerup", "klassisch").
  const punkt = /^[a-zA-Z][\w]*\.[\w.]*$/;
  const nimm = (k) => { if (punkt.test(k)) raus.add(k); };
  for (const m of js.matchAll(/\bt\(\s*["'`]([a-zA-Z][\w.]*)["'`]/g)) nimm(m[1]);
  for (const m of js.matchAll(/\bT\(\s*["'`]([a-zA-Z][\w.]*)["'`]/g)) nimm(m[1]);
  for (const m of js.matchAll(/\buebersetzt\(\s*["'`]([a-zA-Z][\w.]*)["'`]/g)) nimm(m[1]);
  for (const m of js.matchAll(/\bk:\s*[^,\n]*?["'`]([a-zA-Z][\w]*\.[\w.]*)["'`]/g)) nimm(m[1]);
  for (const m of js.matchAll(/\[\s*"([a-zA-Z][\w]*\.[\w.]*)",\s*["'`]/g)) nimm(m[1]);
  // Markup, das erst im Code entsteht - die Einstellung, die ein Spiel in den
  // Warteraum haengt, steht als Zeichenkette in app.js und nicht im HTML.
  for (const k of ausMarkup(js)) raus.add(k);
  return raus;
}

const lies = (p) => readFileSync(`${WURZEL}/${p}`, "utf8");

// Die zwei Seiten stehen fest, die Spiele kommen aus `spiele.json`: wer dort
// `sprache` unter `gemeinsam` fuehrt, ist uebersetzt und wird hier geprueft.
// So waechst die Probe mit, ohne dass jemand sie nachtraegt.
const ORTE = [
  {
    name: "Spieleuebersicht",
    html: "spiele/index.html",
    texte: "spiele/texte.js",
    code: ["spiele/index.html"],   // das Skript steht inline in der Seite
  },
  {
    name: "Startseite",
    html: "index.html",
    texte: "texte.js",
    code: ["index.html"],
  },
];

{
  const registry = JSON.parse(readFileSync(`${WURZEL}/spiele.json`, "utf8"));
  for (const spiel of registry.spiele) {
    const wohin = spiel.gemeinsam?.sprache;
    if (!wohin) continue;
    // `public/sprache.js` heisst: Server-Spiel mit public/-Ordner.
    // `sprache.js` heisst: Solo-Spiel, alles liegt flach im Ordner.
    const unter = wohin.includes("/") ? `${spiel.name}/public` : spiel.name;
    // Der Client liegt meist in app.js daneben - Card Chaos hat ihn in js/.
    const code = [];
    for (const kandidat of [`${unter}/app.js`, `${unter}/js/app.js`, `${unter}/js/board.js`,
                            `${unter}/gemeinsam.js`]) {
      try {
        readFileSync(`${WURZEL}/${kandidat}`);
        code.push(kandidat);
      } catch { /* hat dieses Spiel nicht */ }
    }
    for (const dazu of ["schale.js"]) {
      try {
        readFileSync(`${WURZEL}/${unter}/${dazu}`);
        code.push(`${unter}/${dazu}`);
      } catch { /* hat dieses Spiel nicht */ }
    }
    try {
      readFileSync(`${WURZEL}/${spiel.name}/server.js`);
      code.push(`${spiel.name}/server.js`);
    } catch { /* rein statisch */ }
    ORTE.push({
      name: spiel.titel ?? spiel.name,
      html: `${unter}/index.html`,
      texte: `${unter}/texte.js`,
      code,
    });
  }
}

for (const ort of ORTE) {
  const html = lies(ort.html);
  const { WOERTER } = await import(pathToFileURL(`${WURZEL}/${ort.texte}`).href);

  const benutzt = ausMarkup(html);
  const roher = [html, ...ort.code.map(lies)].join("\n");
  for (const datei of ort.code) for (const k of ausCode(lies(datei))) benutzt.add(k);

  console.log(`\n${ort.name} (${benutzt.size} Schlüssel)`);

  const sprachen = Object.keys(WOERTER);
  pruefe(
    sprachen.length === 2 && sprachen.includes("tr") && sprachen.includes("en"),
    `führt genau tr und en (${sprachen.join(", ")}) – Deutsch steht im HTML`,
  );

  // Schluessel, die im Code zusammengesetzt werden (`t("ww.rolle." + kurz)`),
  // stehen als Praefix mit Punkt am Ende da. Sie sind kein eigener Eintrag -
  // alles, was darunter haengt, gilt als benutzt.
  const praefixe = [...benutzt].filter((k) => k.endsWith("."));
  for (const p of praefixe) benutzt.delete(p);
  const istBenutzt = (k) => benutzt.has(k) || praefixe.some((p) => k.startsWith(p));

  for (const s of sprachen) {
    const fehlt = [...benutzt].filter((k) => !(k in WOERTER[s])).sort();
    pruefe(fehlt.length === 0,
      `${s}: keine unübersetzten Schlüssel${fehlt.length ? " – fehlt: " + fehlt.slice(0, 6).join(", ") : ""}`);

    // Was aus `schale-texte.js` kommt, faellt hier heraus: die Datei ist
    // gemeinsam, und kein Spiel benutzt jeden Schluessel daraus.
    const ueber = Object.keys(WOERTER[s])
      // Fuer die Karteileichen genuegt, dass der Schluessel irgendwo woertlich
      // dasteht - ein Aufruf, den das Muster oben nicht erkennt, ist trotzdem
      // einer. Hier ist Grosszuegigkeit richtig: die Frage ist nur, ob eine
      // Uebersetzung ueberhaupt gebraucht wird.
      .filter((k) =>
        !istBenutzt(k) && !roher.includes(`"${k}"`) && !roher.includes(`'${k}'`) &&
        !k.startsWith("schale.") && !k.startsWith("c.")
      )
      .sort();
    pruefe(ueber.length === 0,
      `${s}: keine Karteileichen${ueber.length ? " – unbenutzt: " + ueber.slice(0, 6).join(", ") : ""}`);

    const leer = Object.entries(WOERTER[s]).filter(([, v]) => !String(v).trim()).map(([k]) => k);
    pruefe(leer.length === 0, `${s}: kein leerer Text${leer.length ? " – " + leer.join(", ") : ""}`);

    // Die Geruestskripte legen die eigenen Saetze eines neuen Spiels mit einem
    // TODO an. Das ist Absicht: so faellt hier auf, was noch niemand uebersetzt
    // hat, statt dass deutscher Text unbemerkt als Uebersetzung durchgeht.
    const offen = Object.entries(WOERTER[s]).filter(([, v]) => /\bTODO\b/.test(String(v))).map(([k]) => k);
    pruefe(offen.length === 0, `${s}: nichts steht mehr auf TODO${offen.length ? " – offen: " + offen.slice(0, 6).join(", ") : ""}`);
  }

  // Beide Sprachen muessen dieselben Schluessel fuehren, sonst faellt eine
  // von beiden unbemerkt auf Deutsch zurueck.
  const nurTr = Object.keys(WOERTER.tr).filter((k) => !(k in WOERTER.en));
  const nurEn = Object.keys(WOERTER.en).filter((k) => !(k in WOERTER.tr));
  pruefe(nurTr.length === 0 && nurEn.length === 0,
    `tr und en führen denselben Satz Schlüssel${nurTr.length ? " – nur tr: " + nurTr.join(", ") : ""}${nurEn.length ? " – nur en: " + nurEn.join(", ") : ""}`);

  // Platzhalter: steht {name} nur in einer Sprache, bleibt in der anderen der
  // Name weg - und niemand merkt es, weil der Satz trotzdem dasteht.
  const platz = (t) => [...String(t).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
  const schief = Object.keys(WOERTER.tr)
    .filter((k) => platz(WOERTER.tr[k]) !== platz(WOERTER.en[k] ?? ""))
    .slice(0, 5);
  pruefe(schief.length === 0,
    `gleiche Platzhalter in beiden Sprachen${schief.length ? " – schief: " + schief.join(", ") : ""}`);

  // Auszeichnung: ein <b> im deutschen Satz gehoert auch in die Uebersetzung,
  // sonst steht der Satz dort ohne Hervorhebung da. Geprueft wird nur, dass
  // beide Sprachen gleich viele Tags haben.
  const tags = (t) => (String(t).match(/<[a-z]/g) ?? []).length;
  const ungleich = Object.keys(WOERTER.tr)
    .filter((k) => tags(WOERTER.tr[k]) !== tags(WOERTER.en[k] ?? ""))
    .slice(0, 5);
  pruefe(ungleich.length === 0,
    `gleiche Auszeichnung in beiden Sprachen${ungleich.length ? " – ungleich: " + ungleich.join(", ") : ""}`);
}

// ---------------------------------------------------------------------------
// Teil 2: im Browser
// ---------------------------------------------------------------------------

const browser = await chromium.launch();

async function seite(url, { js = true, locale = "de-DE" } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale,
    javaScriptEnabled: js,
  });
  const p = await ctx.newPage();
  p._fehler = [];
  p.on("console", (m) => { if (m.type() === "error") p._fehler.push(m.text()); });
  p.on("pageerror", (e) => p._fehler.push(String(e)));
  await p.goto(url, { waitUntil: js ? "networkidle" : "domcontentloaded" });
  return p;
}

try {
  // --- Die Uebersicht ------------------------------------------------------
  console.log("\nSpieleübersicht im Browser");
  {
    const p = await seite(SPIELE_URL);
    pruefe(await p.getAttribute("html", "lang") === "de",
      "ein deutscher Browser bekommt Deutsch");
    pruefe(await p.locator(".sprachknopf").count() === 3, "drei Sprachknöpfe");

    const deH1 = await p.textContent("h1");
    await p.click('.sprachknopf[data-sprache="tr"]');
    await schlaf(250);
    pruefe(await p.getAttribute("html", "lang") === "tr", "Umschalten setzt lang=tr");
    pruefe(await p.textContent("h1") !== deH1, "die Überschrift wechselt mit");
    pruefe(!/Browserspiele/.test(await p.textContent('[data-spiel="keep"] .kurz')),
      "auch die Kacheln wechseln, nicht nur der Rahmen");
    pruefe((await p.title()).includes("Oyunlar"), "der Seitentitel wechselt mit");
    pruefe(await p.evaluate(() => sprache.fehlendeSchluessel().length) === 0,
      "kein Schlüssel bleibt unübersetzt");

    // Die Anleitung steht in einem <template> und ist damit ausserhalb des
    // Dokuments - sie wird erst beim Klonen uebersetzt.
    await p.click('[data-spiel="keep"] .info');
    await p.waitForSelector("#spielDialog[open]", { timeout: 5000 });
    await schlaf(200);
    const schritt = await p.textContent("#spielSchritte li");
    pruefe(!/Raum aufmachen/.test(schritt), `die Schritte im Dialog sind übersetzt: „${schritt.slice(0, 40)}…"`);
    await p.keyboard.press("Escape");

    // Die Suche baut ihren Index aus dem, was auf den Kacheln steht.
    await p.fill("#suche", "kart");
    await schlaf(200);
    const trefferTr = await p.locator(".game:not([hidden])").count();
    pruefe(trefferTr > 0, `die Suche findet auch türkische Wörter (${trefferTr} Treffer für „kart")`);
    await p.fill("#suche", "");

    await p.click('.sprachknopf[data-sprache="en"]');
    await schlaf(250);
    pruefe((await p.textContent('[data-spiel="keep"] .tag')).includes("players"),
      "Englisch: auch die Marken wechseln");

    // Die Wahl bleibt.
    await p.reload({ waitUntil: "networkidle" });
    pruefe(await p.getAttribute("html", "lang") === "en", "die Wahl überlebt ein Neuladen");
    pruefe(p._fehler.length === 0, `Konsole still (${p._fehler.join(" | ").slice(0, 120)})`);
    await p.context().close();
  }

  // --- Ohne JavaScript -----------------------------------------------------
  console.log("\nOhne JavaScript");
  {
    const p = await seite(SPIELE_URL, { js: false, locale: "tr-TR" });
    pruefe(await p.getAttribute("html", "lang") === "de", "bleibt deutsch");
    pruefe(await p.locator(".game").count() >= 20,
      `alle Kacheln stehen da (${await p.locator(".game").count()})`);
    pruefe((await p.textContent('[data-spiel="keep"] .kurz')).includes("Automat"),
      "und tragen ihren deutschen Text");
    pruefe(await p.locator(".sprachknopf").count() === 0,
      "der Umschalter bleibt leer statt als toter Kasten dazustehen");
    await p.context().close();
  }

  // --- Ein tuerkischer Browser --------------------------------------------
  console.log("\nEin türkischer Browser");
  {
    const p = await seite(SPIELE_URL, { locale: "tr-TR" });
    pruefe(await p.getAttribute("html", "lang") === "tr",
      "bekommt beim ersten Besuch Türkisch, ohne etwas anzuklicken");
    await p.context().close();
  }

  // --- Die Startseite ------------------------------------------------------
  console.log("\nStartseite");
  {
    const p = await seite(START_URL);
    pruefe(await p.locator(".sprachknopf").count() === 3, "drei Sprachknöpfe");
    await p.click('.sprachknopf[data-sprache="en"]');
    await schlaf(250);
    pruefe((await p.textContent("h1")).includes("Three applications"), "die Überschrift wechselt");
    pruefe((await p.textContent("footer nav a")).includes("German"),
      "die Rechtstexte sind als deutsch gekennzeichnet, nicht übersetzt");
    pruefe(p._fehler.length === 0, `Konsole still (${p._fehler.join(" | ").slice(0, 120)})`);
    await p.context().close();
  }

  // --- Paare ---------------------------------------------------------------
  console.log("\nPaare (eigene Fassung auf 8087)");
  let laeuft = true;
  try {
    const antwort = await fetch(PAARE_URL, { method: "HEAD" });
    laeuft = antwort.ok;
  } catch {
    laeuft = false;
  }
  if (!laeuft) {
    console.log("  --   übersprungen: auf 8087 läuft nichts (siehe Kopf dieser Datei)");
  } else {
    const p = await seite(PAARE_URL);
    pruefe(await p.locator(".sprachknopf").count() === 3, "drei Sprachknöpfe auf dem Startbildschirm");
    await p.click('.sprachknopf[data-sprache="tr"]');
    await schlaf(250);
    pruefe(!/aufdecken/.test(await p.textContent(".tag")), "der Untertitel wechselt");
    pruefe((await p.textContent(".rooms-empty")).includes("oda"),
      "auch die Raumliste, die aus schale.js kommt");

    await p.click("#helpBtn");
    await schlaf(150);
    pruefe(!/gemeinsames Brett/.test(await p.textContent("#helpList")), "die Hilfe wechselt");
    await p.click("#helpClose");

    await p.fill("#name", "Ada");
    await p.click("#createBtn");
    await p.waitForSelector("#screen-lobby.active", { timeout: 10000 });
    await schlaf(200);
    pruefe(!/Raumcode/.test(await p.textContent(".codebox-label")), "der Warteraum ist übersetzt");
    pruefe(!/wartet|bereit/.test(await p.textContent(".seat .st")),
      "und der Sitzzustand, den schale.js schreibt");
    pruefe(!/Paare/.test(await p.textContent("#hostExtra .setting-label")),
      "und die Einstellung, die das Spiel selbst einhängt");
    await p.click("[data-raus]").catch(() => {});
    pruefe(p._fehler.length === 0, `Konsole still (${p._fehler.join(" | ").slice(0, 120)})`);
    await p.context().close();
  }
  // --- Alle uebersetzten Spiele einmal umschalten --------------------------
  //
  // Kein Tiefgang, sondern die eine Frage, die sich nicht statisch beantworten
  // laesst: kommt `sprache.js` ueberhaupt zum Zug, und bleibt dabei die
  // Konsole still? Was danach im Spiel passiert, pruefen die Proben der Spiele.
  console.log("\nJedes übersetzte Spiel einmal umgeschaltet");
  {
    const registry = JSON.parse(readFileSync(`${WURZEL}/spiele.json`, "utf8"));
    const spiele = registry.spiele.filter((s) => s.gemeinsam?.sprache);
    for (const spiel of spiele) {
      const url = `https://inf-zeus.de${spiel.pfad}`;
      let p;
      try {
        p = await seite(url);
        // Manche Spiele fragen beim ersten Besuch nach einem Namen - der
        // Dialog liegt ueber allem und muss erst weg.
        for (const zu of ["#namenSpaeter", "#leuteZu"]) {
          const knopf = p.locator(zu);
          if (await knopf.count() && await knopf.isVisible()) await knopf.click();
        }
        // Steckt der Umschalter in der Hilfe (Ameisen), muss sie erst auf.
        // Der Klick geht ueber das Element selbst: bei Ameisen liegt das halbe
        // Fenster als Spielflaeche darueber und faengt Zeigerklicks ab.
        // "attached", nicht "visible": bei Ameisen liegt der Umschalter in der
        // Hilfe und ist erst sichtbar, wenn die auf ist.
        await p.waitForSelector(".sprachknopf", { timeout: 8000, state: "attached" });
        if (!await p.locator(".sprachknopf").first().isVisible().catch(() => false)) {
          await p.evaluate(() => document.getElementById("hilfeBtn")?.click());
          await schlaf(400);
        }
        await p.waitForSelector(".sprachknopf", { timeout: 8000, state: "visible" });
        const vorher = await p.textContent("body");
        await p.evaluate(() =>
          document.querySelector('.sprachknopf[data-sprache="tr"]')?.click()
        );
        await schlaf(300);
        const nachher = await p.textContent("body");
        const lang = await p.getAttribute("html", "lang");
        pruefe(lang === "tr" && vorher !== nachher && p._fehler.length === 0,
          `${spiel.pfad} schaltet um (lang=${lang}${p._fehler.length ? ", Konsole: " + p._fehler[0].slice(0, 60) : ""})`);
      } catch (e) {
        pruefe(false, `${spiel.pfad} – ${String(e).split("\n")[0].slice(0, 90)}`);
      } finally {
        await p?.context().close();
      }
    }
  }
} finally {
  await browser.close();
}

console.log(`\n${gruen} grün, ${rot} rot`);
if (rot) {
  console.error("\nBefunde:");
  for (const f of befunde) console.error("  · " + f);
  process.exit(1);
}
console.log("ALLES GRÜN");
