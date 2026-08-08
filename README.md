# inf-zeus.de – Seitenrahmen

Alles, was auf inf-zeus.de nicht zu einem einzelnen Spiel gehört: die
Spieleübersicht, Impressum und Datenschutzerklärung, der gemeinsame Stil der
Rechtstexte und die Apache-Regeln des DocumentRoot.

Die vier Spiele und der Bugreport liegen in eigenen Repos und werden hier
bewusst nicht mitversioniert – ein Fehler an der Startseite soll kein Spiel
mitreißen.

## Inhalt

| Pfad | Was |
|---|---|
| `spiele/index.html` | Startseite mit den vier Spielkacheln, Statuspunkten und dem Spendenknopf |
| `impressum/index.html` | Anbieterkennzeichnung nach § 5 DDG |
| `datenschutz/index.html` | Datenschutzerklärung |
| `recht.css` | gemeinsamer Stil der beiden Rechtstexte |
| `index.php` | Weiterleitung auf die Startseite |
| `.htaccess` | sperrt die interne Risikoliste und `/.git/` |

Kein Build-Schritt, keine Abhängigkeiten. Die Startseite trägt ihren Stil
inline, die beiden Rechtstexte teilen sich `recht.css`, damit sie nicht
auseinanderlaufen.

## Wo das liegt

Das Repo wird direkt nach `/var/www/html` ausgecheckt. Die `.gitignore` ist eine
**Freigabeliste**: erst wird alles ignoriert, dann werden die sechs Einträge
oben einzeln zugelassen. Nextcloud, die Tradingbots, die Spiel-Repos und
`RISIKEN-TODO.md` bleiben dadurch zuverlässig draußen.

## Verwandte Repos

- Keep · Card Chaos · Seconds · Lucky Reflex – die vier Spiele
- Bugreport – Fehlermeldungen zu allen vieren

## Alles auf einmal aktualisieren

```bash
for d in /var/www/html /var/www/html/{keep,cardchaos,seconds,luckyreflex,bugreport}; do
  printf '%-34s ' "$d"; git -C "$d" pull --ff-only
done
```
