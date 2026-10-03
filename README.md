# Same Pill, New Look

Know before you open the bag. Same Pill, New Look tells patients and caregivers when a refill comes from a different generic manufacturer and will look different, so they check with their pharmacist instead of quietly skipping doses.

**Live app:** https://perezamadorluisenrique-gif.github.io/same-pill-new-look/

## Why

Generic drugs from different manufacturers are interchangeable but often look different, and pharmacies switch suppliers without telling anyone. In a study of 11,513 patients on heart medicines after a heart attack, 29% got a refill whose pill had changed appearance. A color change raised the odds of stopping the drug by 34% and a shape change by 66% ([Kesselheim et al., Annals of Internal Medicine, 2014](https://doi.org/10.7326/M13-2381)).

## What it does

1. **Save what you take.** Type or scan the NDC (National Drug Code) from the pharmacy label or the maker's bottle. The app looks up the product in NLM RxNav and shows the maker, color, shape, imprint and size.
2. **Check each refill before opening it.** Scan the new bottle. The app matches it to your saved medicine by its RxNorm clinical drug (ingredient, strength and form) and compares the two:
   - **New look:** same listed medicine, new maker, different color, shape, imprint or size. Shows both pills side by side with the changes highlighted.
   - **New maker:** same listed medicine and the listed look matches.
   - **Same as before:** same product code.
   - **Doesn't match:** a different medicine. Tells you not to take it until you've talked to your pharmacist.
3. **Ask your pharmacist.** A ready-to-send message names both makers, both NDCs and both looks.
4. **Pill chart.** A printable chart of what each saved medicine should look like now, for the pill organizer. Updated when you confirm a new-look refill.

It also works for caregivers (each medicine can say who takes it), installs as an app on a phone, and works offline for everything except new lookups. Use **Try an example** to see the whole flow with real NLM records for amlodipine 5 mg from Mylan (blue, round) and Camber (white, round).

## Safety framing

This app does not identify pills. NLM asks that its appearance data not be used for pill identification, and the data is self-reported by manufacturers. Every message is framed as "your refill comes from a new manufacturer, confirm with your pharmacist", never "this pill is safe".

## Privacy

There is no account and no server. The medicine list lives in the browser's local storage on the device. The only thing sent anywhere is the NDC being looked up, which goes straight from the browser to `rxnav.nlm.nih.gov`.

## How it works

A static site with no build step:

| File | Role |
| --- | --- |
| `core.js` | NDC parsing (hyphenated, 10/11-digit, UPC-A, EAN-13, GTIN-14, GS1 DataMatrix), RxNav lookups, comparison, pill drawing. Pure functions, tested in Node. |
| `app.js` | The page: views, local storage, barcode scanning, example mode. |
| `examples.js` | Real RxNav records used by example mode and the tests. |
| `sw.js`, `manifest.webmanifest` | Installable, offline app shell. |
| `vendor/zxing-0.21.3.min.js` | Barcode decoding where the browser has no `BarcodeDetector` (iOS Safari). Apache-2.0. |

Data sources:

- [`getNDCProperties`](https://lhncbc.nlm.nih.gov/RxNav/APIs/api-RxNorm.getNDCProperties.html) for maker, color, shape, imprint, size and the DailyMed set id. Shape and color come back as FDA SPL codes (for example `C48348` is round), which `core.js` maps to words.
- [`getRxConceptProperties`](https://lhncbc.nlm.nih.gov/RxNav/APIs/api-RxNorm.getRxConceptProperties.html) and `getRelatedByType` to name the drug and map brand products to their clinical drug.
- DailyMed label links for official photos.

A bare 10-digit NDC can be read three ways (4-4-2, 5-3-2, 5-4-1). The app asks for all three; if more than one is a real product, it asks the user to pick the maker on their bottle.

## Run it

```sh
npm test         # unit tests, Node 18+
npm start        # serves on http://localhost:8080
```

Pushing to `main` runs the tests and publishes the site to the `gh-pages` branch, which GitHub Pages serves.

## Ideas for next steps

- Spanish and other languages.
- Pharmacy partners could push a "your next refill will look different" note before pickup.
- Medicare Advantage plans care about adherence through star ratings and could offer this to members.

## Credits

This product uses publicly available data from the U.S. National Library of Medicine (NLM), National Institutes of Health, Department of Health and Human Services; NLM is not responsible for the product and does not endorse or recommend this or any other product.

MIT licensed. See `LICENSE`.
