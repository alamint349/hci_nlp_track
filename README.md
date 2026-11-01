# HCI & NLP deadlines

A static deadline tracker for top HCI and NLP venues: live countdowns, a 12‑month timeline, times converted to the visitor's time zone, stars, search, and calendar export (.ics and Google Calendar). No build step, no backend, so it runs on GitHub Pages as is.

## Put it on GitHub Pages

1. Create a new public repository on GitHub, for example `hci-nlp-deadlines`.
2. Upload everything in this folder, keeping the structure:
   ```
   index.html
   styles.css
   app.js
   .nojekyll
   data/conferences.yml
   ```
   (On the repo page: **Add file → Upload files**, then drag the files and the `data` folder in. `.nojekyll` is a hidden empty file; if your file browser hides it, create it on GitHub with **Add file → Create new file**.)
3. Go to **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, pick `main` and `/ (root)`, and save.
4. After a minute the site is live at `https://<your-username>.github.io/hci-nlp-deadlines/`.

Optional: open `app.js` and set `repo: 'https://github.com/<you>/hci-nlp-deadlines'` near the top. The footer then links straight to the data file's edit page.

## Add or update a conference

Everything lives in `data/conferences.yml`. Edit it on GitHub and commit; the site picks it up on the next page load.

```yaml
  - id: chi-2028
    name: CHI
    year: 2028
    field: hci            # hci or nlp
    full: ACM CHI Conference on Human Factors in Computing Systems
    rank: A*              # optional
    place: Somewhere, Country
    start: 2028-04-20
    end: 2028-04-25
    link: https://chi2028.acm.org/
    estimated: true       # remove once the official CFP is out
    deadlines:
      - label: Abstracts
        date: 2027-09-02
      - label: Full papers
        date: 2027-09-09
      - label: Posters
        date: 2028-01-20
        kind: track       # hidden unless "Posters, demos and other tracks" is on
```

A date without a time counts down to 23:59 in the venue's time zone (AoE by default). Use `"2027-09-09 17:00"` with `timezone: UTC-7` for venues with a different cutoff. Use `rolling: true` for venues without fixed deadlines.

## Preview locally

Browsers block reading the data file when you double-click `index.html`. Run a tiny server instead:

```
python3 -m http.server
```

and open http://localhost:8000.

## About the data

Dates were checked against official sites on 1 Nov 2026. Venues whose next call isn't out yet (UIST, VIS, ASSETS, COLM, EMNLP 2027, CHI 2028, IUI 2028) are marked **Estimated** and projected from the previous edition; replace them when the real calls appear. CORE ranks are shown only where known; leave `rank` blank if unsure.
