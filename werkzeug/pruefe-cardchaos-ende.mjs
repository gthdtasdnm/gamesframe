// Card Chaos, Bugreport 14 und 15 – der Bildschirm „Durch", auf dem man auf
// die anderen wartet und die Risikoleiter steht:
//
//   14  Der Gewinn stand da, bevor die Münze ausgedreht hatte. Der Client hat
//       `st.score` sofort beim Eintreffen von `risk` gesetzt; der `live`-Push,
//       den der Server direkt hinterherschickt, ruft `renderDone()` auf und
//       schrieb den neuen Stand sichtbar hin – 900 ms zu früh.
//   15  Das Fahnen-Emoji lief unter `animation: bob … infinite` und wackelte
//       die ganze Wartezeit.
//
// Beides ist reine Anzeige, beides ist ohne eine komplett leergespielte Runde
// nicht sichtbar. Deshalb prüft diese Probe die zwei Stellen dort, wo sie
// entstehen: am gerechneten Stil des Emojis (das Element steht im DOM, auch
// solange der Bildschirm verborgen ist) und am ausgelieferten Quelltext.
//
//   cd /root/werkzeug-screenshots && node pruefe-cardchaos-ende.mjs
//
// Versioniert in /var/www/html/werkzeug/.

import { chromium } from "playwright";

const BASIS = process.env.BASIS ?? "https://inf-zeus.de";
let gruen = 0, rot = 0;
const befunde = [];
const pruefe = (ok, text) => {
  if (ok) { gruen++; console.log(`  ok   ${text}`); }
  else { rot++; befunde.push(text); console.error(`  FEHL ${text}`); }
};

const browser = await chromium.launch();
const seite = await browser.newPage({ viewport: { width: 390, height: 844 } });
const konsole = [];
seite.on("console", (m) => { if (m.type() === "error") konsole.push(m.text()); });
seite.on("pageerror", (e) => konsole.push(String(e)));

try {
  await seite.goto(`${BASIS}/cardchaos/`, { waitUntil: "networkidle" });

  // --- 15: die Fahne steht still --------------------------------------------
  const stil = await seite.evaluate(() => {
    const el = document.getElementById("done-icon");
    if (!el) return null;
    const s = getComputedStyle(el);
    return { name: s.animationName, mal: s.animationIterationCount, dauer: s.animationDuration };
  });
  pruefe(Boolean(stil), "das Emoji des Wartebildschirms steht im DOM");
  if (stil) {
    pruefe(stil.mal !== "infinite",
      `keine Dauerbewegung: ${stil.name} ${stil.dauer} ×${stil.mal}`);
    pruefe(!/(^|\s)bob(\s|$)/.test(stil.name),
      `nicht mehr das wackelnde „bob" (${stil.name})`);
  }

  // --- 14: erst die Münze, dann der Gewinn -----------------------------------
  const quelle = await (await fetch(`${BASIS}/cardchaos/js/app.js`)).text();
  const anfang = quelle.indexOf("net.on('risk'");
  const ende = quelle.indexOf("net.on('riskWindow'");
  pruefe(anfang > 0 && ende > anfang, "der risk-Handler ist im ausgelieferten app.js zu finden");
  const handler = quelle.slice(anfang, ende);
  const beiScore = handler.indexOf("st.score = m.score");
  const beiTimer = handler.indexOf("setTimeout(");
  pruefe(beiScore > 0, "der Handler übernimmt einen neuen Punktestand");
  pruefe(beiTimer > 0 && beiScore > beiTimer,
    "der neue Stand wird erst im setTimeout übernommen, nicht sofort");

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
