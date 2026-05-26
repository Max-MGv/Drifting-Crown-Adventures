const puppeteer = require('puppeteer');
const path      = require('path');
const fs        = require('fs');

const REPO    = path.resolve(__dirname, '../..');
const ADV_DIR = path.join(REPO, 'adventures');

function parseHomepage(adventureName) {
  const html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');

  // Adventure blurb from the card on the homepage
  const descRe = new RegExp(
    `href="adventures/${adventureName}/[^"]*"[\\s\\S]*?adventure-card-desc">\\s*([\\s\\S]*?)\\s*<\\/div>`
  );
  const descMatch = html.match(descRe);
  const desc = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '';

  // Credit names from the Thanks & Credits section
  const creditsSection = html.match(/Thanks[^<]*Credits[\s\S]*?section-body">([\s\S]*?)<\/div>\s*<\/div>/);
  const credits = [];
  if (creditsSection) {
    const h3Re = /<h3>([^<]+)<\/h3>/g;
    let m;
    while ((m = h3Re.exec(creditsSection[1])) !== null) {
      credits.push(m[1].replace(/&amp;/g, '&'));
    }
  }

  return { desc, credits };
}

// A4 at 96 DPI = 1122px tall. With 16mm top + 16mm bottom margins (~121px total),
// usable content height per page is ~1001px. We use a conservative estimate for TOC
// page-number calculation (off-by-one is acceptable; breaks push content down anyway).
const CONTENT_HEIGHT_PX = 980;

const PRINT_CSS = `
  /* ── Force print backgrounds ── */
  *, *::before, *::after {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  /* ── Hide all UI chrome ── */
  #sidebar, #sidebar-toggle, #sidebar-header,
  #notes-toggle, #notes-panel, #notes-resize-handle,
  #sb-popup, #mobile-backdrop, #top-btn,
  .scroll-to-top, .image-toggle, .image-reveal-btn,
  script[data-goatcounter] { display: none !important; }

  /* ── Body / page background + print font size ── */
  html { font-size: 13px !important; }
  body { background: #f4ead5 !important; margin: 0 !important; padding: 0 !important; }

  /* ── Main content: full width, no sidebar offset ── */
  #main {
    margin: 0 !important;
    padding: 0 1rem !important;
    max-width: 100% !important;
    background: #f4ead5 !important;
  }

  /* ── Hide original page-title block (replaced by cover page) ── */
  .page-title { display: none !important; }

  /* ── Reveal all images ── */
  .image-reveal .image-container {
    display: block !important;
    max-height: 280px;
    overflow: hidden;
    margin: 0.5rem 0;
  }
  .image-reveal .image-container img {
    width: 100%;
    max-height: 280px;
    object-fit: cover;
    display: block;
  }

  /* ── Open all <details> ── */
  details > *:not(summary) { display: block !important; }

  /* ── Page break rules ── */
  .section        { margin-bottom: 1.2rem !important; }
  .section-header { break-after: avoid; page-break-after: avoid; }
  .npc-card       { break-inside: avoid; page-break-inside: avoid; }
  .statblock, .sb-card { break-inside: avoid; page-break-inside: avoid; }
  .ba-card        { break-inside: avoid; page-break-inside: avoid; }
  .room           { break-inside: avoid; page-break-inside: avoid; }
  .callout        { break-inside: auto; }
  .read-aloud     { break-inside: auto; }
  .styled-table   { break-inside: avoid; page-break-inside: avoid; }

  /* ── Suppress header/footer on cover page ── */
  @page :first { margin-top: 0 !important; margin-bottom: 0 !important; }

  /* cover page: all styled inline — nothing here */

  /* ── TOC page ── */
  #pdf-toc {
    page-break-after: always;
    break-after: page;
    background: #f4ead5 !important;
    padding: 2.5rem 3rem 2rem;
  }
  #pdf-toc h2 {
    font-family: Georgia, serif;
    font-size: 1.5rem;
    color: #8b1a1a;
    text-align: center;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    margin: 0 0 0.4rem;
  }
  #pdf-toc .toc-rule {
    border: none;
    border-top: 2px solid #a07830;
    margin: 0 0 1.5rem;
  }
  #pdf-toc ul { list-style: none; padding: 0; margin: 0; }
  #pdf-toc li {
    display: flex;
    align-items: baseline;
    font-family: Georgia, serif;
    font-size: 0.9rem;
    color: #2c1a0e;
    padding: 0.3rem 0;
    border-bottom: 1px solid rgba(160, 120, 48, 0.15);
  }
  #pdf-toc .toc-title  { flex-shrink: 0; padding-right: 0.4rem; }
  #pdf-toc .toc-dots   { flex: 1; border-bottom: 1px dotted #a07830; margin: 0 0.5rem; position: relative; top: -3px; }
  #pdf-toc .toc-page   { flex-shrink: 0; font-weight: bold; color: #8b1a1a; min-width: 2rem; text-align: right; }
`;

async function generateAdventurePDF(port, adventureName) {
  const adventureUrl = `http://localhost:${port}/adventures/${adventureName}/index.html`;

  // Check for optional banner image
  let bannerSrc = '';
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    if (fs.existsSync(path.join(ADV_DIR, adventureName, 'images', `banner.${ext}`))) {
      bannerSrc = `http://localhost:${port}/adventures/${adventureName}/images/banner.${ext}`;
      break;
    }
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1122 });
    await page.goto(adventureUrl, { waitUntil: 'networkidle0', timeout: 30000 });

    // Wait for JS rendering (statblocks, combat tracker, etc.)
    await new Promise(r => setTimeout(r, 1500));

    // Extract adventure metadata from the page
    const meta = await page.evaluate(() => {
      return {
        title:   document.querySelector('.page-title h1')?.textContent?.trim() || document.title,
        tagline: document.querySelector('.page-title .tagline')?.textContent?.trim() || '',
        pills:   Array.from(document.querySelectorAll('.page-title .meta span')).map(s => s.textContent.trim()),
      };
    });

    // Inject print CSS
    await page.addStyleTag({ content: PRINT_CSS });

    // Open all <details> and clean up for print
    await page.evaluate(() => {
      document.querySelectorAll('details').forEach(d => { d.open = true; });

      // Hide scroll-to-top button (id=top-btn in this repo)
      document.querySelectorAll('#top-btn, .scroll-to-top').forEach(el => {
        el.style.setProperty('display', 'none', 'important');
      });

      // 1. Art Credits section — useless in print
      const artCredits = document.getElementById('art-credits');
      if (artCredits) artCredits.style.setProperty('display', 'none', 'important');

      // 2. Source/purchase badges on images
      document.querySelectorAll('.purchase-badge').forEach(el => {
        el.style.setProperty('display', 'none', 'important');
      });

      // 3. Wiki-links — render as plain text, not clickable hyperlinks
      document.querySelectorAll('a.wiki-link').forEach(el => {
        el.style.setProperty('color', 'inherit', 'important');
        el.style.setProperty('text-decoration', 'none', 'important');
        el.style.setProperty('border-bottom', 'none', 'important');
        el.style.setProperty('background', 'none', 'important');
      });

      // 4. Disclosure triangles on forced-open details
      document.querySelectorAll('details > summary').forEach(el => {
        el.style.setProperty('list-style', 'none', 'important');
      });
      // Webkit needs this separately
      const style = document.createElement('style');
      style.textContent = 'details > summary::-webkit-details-marker { display: none !important; }';
      document.head.appendChild(style);

      // 5. Section emoji icons
      document.querySelectorAll('.section-header .icon').forEach(el => {
        el.style.setProperty('display', 'none', 'important');
      });

      // 6. ba-card summary labels (action name is repeated in the body)
      document.querySelectorAll('.ba-card > summary').forEach(el => {
        el.style.setProperty('display', 'none', 'important');
      });

      // Linked Notes: show only statblock entries, hide spells/notes/items
      document.querySelectorAll('.misc-entry').forEach(entry => {
        if (!entry.querySelector('.statblock')) {
          entry.style.setProperty('display', 'none', 'important');
        }
      });
      // Hide lore text inside statblock entries
      document.querySelectorAll('.sb-lore').forEach(el => {
        el.style.setProperty('display', 'none', 'important');
      });
      // Hide misc-summary labels (statblock already has the name)
      document.querySelectorAll('#misc .misc-summary').forEach(el => {
        el.style.setProperty('display', 'none', 'important');
      });
      // Hide the Linked Notes intro paragraph
      const miscIntro = document.querySelector('#misc .section-body > p');
      if (miscIntro) miscIntro.style.setProperty('display', 'none', 'important');
    });
    await new Promise(r => setTimeout(r, 300));

    // Collect section headings + their vertical positions for the TOC
    // Filter out hidden sections (offsetParent === null means display:none)
    const sections = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.section[id]'))
        .filter(s => s.offsetParent !== null)
        .map(s => ({
          id:    s.id,
          title: s.querySelector('.section-header h2')?.textContent?.trim()
                || s.querySelector('h2')?.textContent?.trim()
                || s.id,
          top:   s.getBoundingClientRect().top + window.scrollY,
        }))
    );

    // Estimate page numbers. Cover = p1, TOC = p2, content starts at p3.
    const sectionPages = sections.map(s => ({
      ...s,
      page: Math.floor(s.top / CONTENT_HEIGHT_PX) + 3,
    }));

    // Pull blurb + credits from the homepage
    const { desc, credits } = parseHomepage(adventureName);

    // Inject cover page + TOC into the DOM
    await page.evaluate(({ meta, sectionPages, bannerSrc, desc, credits }) => {
      const main = document.getElementById('main');
      if (!main) return;

      const coverDiv = document.createElement('div');
      coverDiv.id = 'pdf-cover';
      coverDiv.setAttribute('style', [
        'page-break-after: always',
        'break-after: page',
        '-webkit-print-color-adjust: exact',
        'print-color-adjust: exact',
        'background-color: #1a0f05',
        'padding: 5rem 3.5rem 4rem',
        'box-sizing: border-box',
        'text-align: center',
        'font-family: Georgia, serif',
      ].join('; '));

      const pillsHtml = meta.pills.length
        ? meta.pills.map(p =>
            `<span style="display:inline-block;font-family:'Courier New',monospace;font-size:0.72rem;color:#e8d9b8;border:1px solid rgba(160,120,48,0.5);padding:0.2rem 0.65rem;border-radius:3px;margin:0 0.3rem;">${p}</span>`
          ).join('')
        : '';

      coverDiv.innerHTML = `
        <h1 style="font-size:2.6rem;color:#f4ead5;letter-spacing:0.06em;margin:0 0 0.5rem;font-weight:normal;">${meta.title}</h1>
        <hr style="width:55%;border:none;border-top:1px solid #a07830;margin:0 auto 0.75rem;opacity:0.6;">
        ${meta.tagline ? `<p style="font-style:italic;font-size:1rem;color:#c9a84c;margin:0 0 1.4rem;line-height:1.5;">${meta.tagline}</p>` : ''}
        ${pillsHtml ? `<div style="margin-bottom:2.5rem;">${pillsHtml}</div>` : ''}
        ${desc ? `<hr style="width:35%;border:none;border-top:1px solid rgba(160,120,48,0.3);margin:0 auto 1.2rem;"><p style="font-style:italic;font-size:0.88rem;color:#c9a84c;line-height:1.65;max-width:75%;margin:0 auto 1rem;">${desc}</p>` : ''}
        ${credits.length ? `<p style="font-family:'Courier New',monospace;font-size:0.6rem;color:rgba(232,217,184,0.4);letter-spacing:0.12em;text-transform:uppercase;margin:0;">${credits.join(' &nbsp;&middot;&nbsp; ')}</p>` : ''}
      `;
      main.prepend(coverDiv);

      const toc = document.createElement('div');
      toc.id = 'pdf-toc';
      toc.innerHTML = `
        <h2>Table of Contents</h2>
        <hr class="toc-rule">
        <ul>
          ${sectionPages.map(s => `
            <li>
              <span class="toc-title">${s.title}</span>
              <span class="toc-dots"></span>
              <span class="toc-page">${s.page}</span>
            </li>`).join('')}
        </ul>`;
      coverDiv.insertAdjacentElement('afterend', toc);
    }, { meta, sectionPages, bannerSrc, desc, credits });

    // Let background image and any content images finish loading
    await new Promise(r => setTimeout(r, 1500));

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: `
        <div id="phdr" style="width:100%;font-size:8px;font-family:Georgia,serif;color:#5c3d1e;
             padding:5px 15mm 0;border-bottom:1px solid rgba(160,120,48,0.35);
             display:flex;justify-content:space-between;box-sizing:border-box;">
          <span>${meta.title}</span>
          <span style="color:#8b1a1a;font-style:italic;">One-Shot Adventure</span>
        </div>
        <script>
          (function(){
            var pn = document.querySelector('.pageNumber');
            if (pn && pn.textContent.trim() === '1') {
              document.getElementById('phdr').style.visibility = 'hidden';
            }
          })();
        </script>`,
      footerTemplate: `
        <div style="width:100%;font-size:8px;font-family:Georgia,serif;color:#5c3d1e;
             padding:0 15mm 4px;text-align:center;box-sizing:border-box;">
          &#8212; <span class="pageNumber"></span> &#8212;
        </div>`,
      margin: { top: '16mm', bottom: '14mm', left: '15mm', right: '15mm' },
    });

    return { pdfBuffer, title: meta.title };

  } finally {
    await browser.close();
  }
}

module.exports = { generateAdventurePDF };
