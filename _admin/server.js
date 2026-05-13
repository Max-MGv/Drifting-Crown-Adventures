const express = require('express');
const cors    = require('cors');
const sharp   = require('sharp');
const path    = require('path');
const fs      = require('fs');
const { execSync } = require('child_process');

const app     = express();
const PORT    = 3001;
const REPO    = path.resolve(__dirname, '..');
const ADV_DIR = path.join(REPO, 'adventures');

app.use(cors());
app.use(express.json());
app.use(express.static(REPO));                 // serves entire repo from root
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ── helpers ────────────────────────────────────────────────────────────────

function getLinkIds(adventureName) {
  const p = path.join(ADV_DIR, adventureName, 'index.html');
  if (!fs.existsSync(p)) return [];
  const html = fs.readFileSync(p, 'utf8');
  const matches = [...html.matchAll(/data-link-id="([^"]+)"/g)];
  return [...new Set(matches.map(m => m[1]))];
}

function getAdventureNames() {
  return fs.readdirSync(ADV_DIR).filter(name => {
    return fs.statSync(path.join(ADV_DIR, name)).isDirectory();
  });
}

function getImages(adventureName) {
  const base = path.join(ADV_DIR, adventureName, 'images');
  if (!fs.existsSync(base)) return [];

  const exts = ['.jpg', '.jpeg', '.png', '.webp'];
  const results = [];

  function walk(dir, prefix) {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const rel  = prefix ? `${prefix}/${entry}` : entry;
      if (fs.statSync(full).isDirectory()) {
        walk(full, rel);
      } else if (exts.includes(path.extname(entry).toLowerCase())) {
        if (!entry.includes('-lowres')) {
          results.push(rel); // e.g. "npcs/gorrath.jpg"
        }
      }
    }
  }

  walk(base, '');
  return results;
}

function readLinksJs(adventureName) {
  const p = path.join(ADV_DIR, adventureName, 'links.js');
  if (!fs.existsSync(p)) return {};

  const raw = fs.readFileSync(p, 'utf8');
  // Extract the object literal from window.AdventureLinks = { ... };
  const match = raw.match(/window\.AdventureLinks\s*=\s*(\{[\s\S]*?\});/);
  if (!match) return {};

  try {
    // Use Function to evaluate the object literal safely
    return new Function(`return ${match[1]}`)(); // eslint-disable-line no-new-func
  } catch {
    return {};
  }
}

function writeLinksJs(adventureName, config) {
  const p = path.join(ADV_DIR, adventureName, 'links.js');
  const entries = Object.entries(config).map(([id, val]) => {
    const fields = [];
    if (val.url)       fields.push(`    url: ${JSON.stringify(val.url)}`);
    if (val.credit)    fields.push(`    credit: ${JSON.stringify(val.credit)}`);
    if (val.lowres)    fields.push(`    lowres: true`);
    if (val.lowresSrc) fields.push(`    lowresSrc: ${JSON.stringify(val.lowresSrc)}`);
    return `  ${JSON.stringify(id)}: {\n${fields.join(',\n')}\n  }`;
  });

  const content = `window.AdventureLinks = {\n${entries.join(',\n')}\n};\n`;
  fs.writeFileSync(p, content, 'utf8');
}

// ── routes ─────────────────────────────────────────────────────────────────

// List all adventures with their images and current links config
app.get('/api/adventures', (req, res) => {
  try {
    const adventures = getAdventureNames().map(name => ({
      name,
      images:  getImages(name),
      config:  readLinksJs(name),
      linkIds: getLinkIds(name),
    }));
    res.json(adventures);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generate a low-res copy of one image
// body: { adventure, imagePath }  e.g. { adventure: "statue-heist", imagePath: "npcs/gorrath.jpg" }
app.post('/api/lowres', async (req, res) => {
  try {
    const { adventure, imagePath } = req.body;
    if (!adventure || !imagePath) return res.status(400).json({ error: 'Missing fields' });

    const srcPath  = path.join(ADV_DIR, adventure, 'images', imagePath);
    const ext      = path.extname(imagePath);
    const lowresRel = imagePath.replace(ext, `-lowres${ext}`);
    const destPath = path.join(ADV_DIR, adventure, 'images', lowresRel);

    if (!fs.existsSync(srcPath)) return res.status(404).json({ error: 'Source image not found' });

    fs.mkdirSync(path.dirname(destPath), { recursive: true });

    await sharp(srcPath)
      .jpeg({ quality: 5 })
      .toFile(destPath);

    res.json({ lowresSrc: `images/${lowresRel}?v=${Date.now()}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save updated links config for one adventure
// body: { adventure, config }
app.post('/api/save', (req, res) => {
  try {
    const { adventure, config } = req.body;
    if (!adventure || !config) return res.status(400).json({ error: 'Missing fields' });
    writeLinksJs(adventure, config);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Publish: git add + commit (if anything changed) + push
app.post('/api/publish', (req, res) => {
  try {
    const { message = 'Admin: update image config' } = req.body;
    execSync('git add -A', { cwd: REPO });
    const status = execSync('git status --porcelain', { cwd: REPO }).toString().trim();
    if (status) {
      execSync(`git commit -m ${JSON.stringify(message)}`, { cwd: REPO });
    }
    execSync('git push', { cwd: REPO });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message, stderr: err.stderr?.toString() });
  }
});

// ── start ──────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Admin server running at http://localhost:${PORT}`);
  console.log(`Serving repo: ${REPO}`);
});
