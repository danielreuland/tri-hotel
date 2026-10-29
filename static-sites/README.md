# Statische Seiten (Übergang)

Statische Seiten für Domains, die (noch) nicht von der tri-hotel-App ausgeliefert werden. Kein Build, keine externen Skripte oder Schriften.

| Ordner | Server | Hinweis |
|---|---|---|
| `fitnessracing-hotel.de/` | `/var/www/fitnessracing-hotel.de/html` | Artikel `/fitness-racing/`; wird beim Start des Fitness-Racing-Rankings eine Site der App (gleiche URLs behalten) |
| `danielreuland.com/` | `/var/www/danielreuland.com/html` | Platzhalter, wird durch die Hub-App ersetzt |

`nginx.conf` je Ordner ist eine Kopie von `/etc/nginx/sites-available/<domain>` (nur zur Dokumentation, wird nicht hochgeladen).

Veröffentlichen (nur auf ausdrückliches „veröffentlichen“):

```
rsync -a --delete --exclude nginx.conf static-sites/fitnessracing-hotel.de/ root@87.106.155.249:/var/www/fitnessracing-hotel.de/html/
rsync -a --delete --exclude nginx.conf static-sites/danielreuland.com/ root@87.106.155.249:/var/www/danielreuland.com/html/
```

Beim Ändern eines Artikels: „Zuletzt aktualisiert“, `dateModified` im JSON-LD und `lastmod` in `sitemap.xml` mitziehen.
