// Card Chaos, Bestenliste – seit dem 19.08.2026 nicht mehr zwei Panels
// nebeneinander (Ruhmeshalle + Top-Ergebnisse), sondern **eine** Tabelle mit
// zwei Umschaltreihen: Zeitraum (diese Woche / ewig) und Rundenzahl (3/5/10).
//
// Was hier nachgewiesen wird, und warum genau das:
//
//   B01  Sechs Felder, aber nur eines sichtbar. Das war der ganze Zweck des
//        Umbaus – „nicht überfüllt".
//   B02  Die Vorauswahl folgt der eingestellten Rundenzahl des Tisches. Wer
//        auf 5 Runden spielt, sieht die 5er-Liste ohne einen Klick.
//   B03  Eine Zeile je Person. Vorher belegte der Vielspieler die halbe
//        Tabelle mit sich selbst (19 von 37 Einträgen ein einziger Name).
//   B04  Die Ruhmeshalle ist wirklich weg – sie sortierte nach Siegen, und
//        in einer Solopartie ist man immer Erster.
//
// Die Probe braucht keinen Mitspieler und keine Partie: sie liest die Liste
// über `/api/leaderboard` gegen und öffnet den Bildschirm im Browser.
//
//   cd /root/werkzeug-screenshots && node pruefe-cardchaos-bestenliste.mjs
//
// Versioniert in /var/www/html/werkzeug/.

import { chromium } from "playwright";

const BASIS = process.env.BASIS ?? "https://inf-zeus.de";
const AUS = process.env.AUS ?? "/tmp/cardchaos-bestenliste.png";
let gruen = 0, rot = 0;
const befunde = [];
const pruefe = (ok, text) => {
  if (ok) { gruen++; console.log(`  ok   ${text}`); }
  else { rot++; befunde.push(text); console.error(`  FEHL ${text}`); }
};

const browser = await chromium.launch();
const seite = await browser.newPage({
    // Deutscher Browser: die Seiten sind dreisprachig und richten sich
    // beim ersten Besuch nach der Spracheinstellung.
    locale: "de-DE", viewport: { width: 390, height: 844 } });
const konsole = [];
seite.on("console", (m) => { if (m.type() === "error") konsole.push(m.text()); });
seite.on("pageerror", (e) => konsole.push(String(e)));

try {
  // --- B01: das Gerüst -------------------------------------------------------
  const daten = await (await fetch(`${BASIS}/cardchaos/api/leaderboard`)).json();
  pruefe(Object.keys(daten.boards ?? {}).join(",") === "3,5,10",
    `die Antwort trägt genau die drei Rundenzahlen (${Object.keys(daten.boards ?? {})})`);
  pruefe([3, 5, 10].every((r) => daten.boards[r].woche && daten.boards[r].ewig),
    "jede Rundenzahl hat eine Wochen- und eine ewige Liste");
  const montag = new Date(daten.wochenStart);
  pruefe(montag.getUTCDay() === 0 || montag.getUTCDay() === 1,
    `die Woche beginnt an einem Montag Berliner Zeit (${montag.toISOString()})`);
  pruefe(daten.wochenStart <= Date.now() && Date.now() - daten.wochenStart < 8 * 86400000,
    "der Wochenstart liegt in der laufenden Woche");

  // --- B03: eine Zeile je Person ---------------------------------------------
  for (const r of [3, 5, 10]) {
    for (const z of ["woche", "ewig"]) {
      const namen = daten.boards[r][z].map((e) => e.name.toLowerCase());
      pruefe(new Set(namen).size === namen.length,
        `${r} Runden / ${z}: jeder Name genau einmal (${namen.length} Zeilen)`);
    }
  }
  const ewig10 = daten.boards[10].ewig;
  pruefe(ewig10.every((e, i) => i === 0 || ewig10[i - 1].score >= e.score),
    "die Liste ist nach Punkten sortiert");
  pruefe(ewig10.every((e) => e.laeufe >= 1),
    "jede Zeile weiß, aus wie vielen Partien ihr bester Lauf stammt");

  await seite.goto(`${BASIS}/cardchaos/`, { waitUntil: "networkidle" });

  // --- B04: die Ruhmeshalle ist weg ------------------------------------------
  pruefe(await seite.locator("#lb-fame").count() === 0, `kein Panel „Ruhmeshalle" mehr`);
  pruefe(await seite.locator("#lb-top").count() === 0, `kein Panel „Top-Ergebnisse" mehr`);
  const quelle = await (await fetch(`${BASIS}/cardchaos/js/app.js`)).text();
  pruefe(!/hallOfFame|lb-fame/.test(quelle), "auch im ausgelieferten app.js keine Spur davon");

  // --- Bildschirm öffnen ------------------------------------------------------
  await seite.fill("#in-name", "Probe");
  await seite.click("#btn-lb-1");
  await seite.waitForSelector("#s-lb.on");
  await seite.waitForFunction(
    () => !/Wird geladen/.test(document.getElementById("lb-liste")?.textContent ?? "Wird geladen"),
    { timeout: 5000 },
  );

  const sichtbar = () => seite.evaluate(() => ({
    zeitraum: [...document.querySelectorAll("#lb-zeitraum .seg")].filter((b) =>
      b.classList.contains("sel")
    ).map((b) => b.dataset.v),
    runden: [...document.querySelectorAll("#lb-runden .seg")].filter((b) =>
      b.classList.contains("sel")
    ).map((b) => b.dataset.v),
    zeilen: document.querySelectorAll("#lb-liste .res").length,
    listen: document.querySelectorAll("#s-lb .lb").length,
    fuss: document.getElementById("lb-fuss")?.textContent ?? "",
  }));

  let s = await sichtbar();
  pruefe(s.listen === 1, `nur eine Tabelle auf dem Bildschirm (${s.listen})`);
  pruefe(s.zeitraum.length === 1 && s.runden.length === 1,
    `je Reihe genau ein Knopf aktiv (${s.zeitraum} / ${s.runden})`);
  pruefe(s.zeitraum[0] === "woche", "die Woche steht vorne – da kommt man noch rein");
  pruefe(s.zeilen === daten.boards[s.runden[0]][s.zeitraum[0]].length,
    `angezeigt wird genau das gewählte Feld (${s.zeilen} Zeilen)`);
  // Berliner Zeit, nicht die des Geraets: sonst steht dort der Sonntag.
  const montagsTag = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "numeric",
    month: "numeric",
  }).format(daten.wochenStart);
  pruefe(/Montag/.test(s.fuss) && s.fuss.includes(montagsTag),
    `die Fußzeile nennt den richtigen Montag (${montagsTag}): „${s.fuss}"`);

  // --- Umschalten -------------------------------------------------------------
  await seite.click("#lb-zeitraum .seg[data-v='ewig']");
  s = await sichtbar();
  pruefe(s.zeitraum[0] === "ewig" && s.zeilen === daten.boards[s.runden[0]].ewig.length,
    `Umschalten auf „Ewig" zeigt die ewige Liste (${s.zeilen} Zeilen)`);

  await seite.click("#lb-runden .seg[data-v='3']");
  s = await sichtbar();
  pruefe(s.runden[0] === "3" && s.zeilen === daten.boards[3].ewig.length,
    `Umschalten auf 3 Runden zeigt deren Liste (${s.zeilen} Zeilen)`);

  // --- B02: die Vorauswahl folgt dem Tisch ------------------------------------
  await seite.click("#btn-lb-back");
  await seite.fill("#in-name", "Probe");
  // Privat, damit der Probetisch niemandem in der Lobby vor die Nase kommt.
  await seite.click(".seg[data-vis='private']");
  await seite.click("#btn-create");
  await seite.waitForSelector("#s-room.on", { timeout: 8000 });
  await seite.selectOption("#in-rounds", "5");
  await seite.waitForFunction(() => document.getElementById("in-rounds").value === "5");
  await seite.click("#btn-lb-2");
  await seite.waitForSelector("#s-lb.on");
  s = await sichtbar();
  pruefe(s.runden[0] === "5",
    `am Tisch über 5 Runden öffnet die Bestenliste auf 5 (${s.runden[0]})`);

  // Kein seitliches Scrollen – die zwei Knopfreihen sind der neue Kandidat.
  const breit = await seite.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  pruefe(!breit, "kein seitliches Scrollen auf 390 px");
  await seite.screenshot({ path: AUS });

  // Den Probetisch wieder abraeumen, sonst steht er bis zum Zeitablauf herum.
  await seite.click("#btn-lb-back");
  await seite.click("#btn-leave").catch(() => {});

  pruefe(konsole.length === 0, `Konsole still (${konsole.join(" | ").slice(0, 200)})`);
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
