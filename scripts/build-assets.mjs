// Generates .github/assets/{hero,architecture}.svg.
//
// All text is converted to vector paths (Geist / Geist Mono via opentype.js)
// so the images render identically everywhere, including GitHub's image proxy,
// which never loads web fonts. The hero's diagnostics come from running the
// built checker on examples/shadcn-demo, so the picture cannot drift from the
// tool's real output. Run `pnpm build` first.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import opentype from 'opentype.js';

import { applyFixes, loadConfig, loadDesignSystem } from '../dist/index.js';

const root = path.resolve(import.meta.dirname, '..');
const OUT = path.join(root, '.github/assets');
fs.mkdirSync(OUT, { recursive: true });

const C = {
  ink: '#0d0f12',
  raised: '#181c22',
  raisedSoft: '#14181d',
  edge: '#262b33',
  edgeStrong: '#353c47',
  fg: '#f5f7fa',
  fgSoft: '#dfe6ee',
  muted: '#9aa6b4',
  subtle: '#6f7b89',
  cyan: '#22d3ee',
  cyanBright: '#67e8f9',
  magenta: '#f0468a',
  magentaSoft: '#5a2a3f',
};

// ─── Fonts and text-to-path ─────────────────────────────────────────────────

// `geist` does not export its package.json; it is a direct devDependency, so read it from node_modules.
const fontDir = path.join(root, 'node_modules/geist/dist/fonts');
const load = (file) => {
  const buffer = fs.readFileSync(path.join(fontDir, file));
  return opentype.parse(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  );
};
const F = {
  sans: load('geist-sans/Geist-Regular.ttf'),
  sansMedium: load('geist-sans/Geist-Medium.ttf'),
  sansSemibold: load('geist-sans/Geist-SemiBold.ttf'),
  mono: load('geist-mono/GeistMono-Regular.ttf'),
  monoMedium: load('geist-mono/GeistMono-Medium.ttf'),
};

function layout(font, str, size, tracking = 0) {
  const scale = size / font.unitsPerEm;
  const glyphs = font.stringToGlyphs(str);
  [...str].forEach((ch, i) => {
    if (glyphs[i]?.index === 0 && ch.trim())
      throw new Error(`"${ch}" is not in ${font.names.fullName.en}`);
  });
  const advances = glyphs.map((g, i) => {
    let a = g.advanceWidth * scale;
    if (i < glyphs.length - 1) {
      const k = font.getKerningValue(g, glyphs[i + 1]);
      a += (Number.isFinite(k) ? k : 0) * scale + tracking;
    }
    if (!Number.isFinite(a)) throw new Error(`bad advance for ${g.name} in "${str}"`);
    return a;
  });
  return { glyphs, advances, width: advances.reduce((s, a) => s + a, 0) };
}

// opentype.js 2.0's toPathData() emits "NaN" for some coordinates, so serialize ourselves.
const num = (v) => {
  if (!Number.isFinite(v)) throw new Error(`non-finite path coordinate ${v}`);
  return String(Math.round(v * 100) / 100);
};
const toD = (commands) =>
  commands
    .map((c) => {
      switch (c.type) {
        case 'M':
        case 'L':
          return `${c.type}${num(c.x)} ${num(c.y)}`;
        case 'Q':
          return `Q${num(c.x1)} ${num(c.y1)} ${num(c.x)} ${num(c.y)}`;
        case 'C':
          return `C${num(c.x1)} ${num(c.y1)} ${num(c.x2)} ${num(c.y2)} ${num(c.x)} ${num(c.y)}`;
        case 'Z':
          return 'Z';
        default:
          throw new Error(`unknown path command ${c.type}`);
      }
    })
    .join('');

const measure = (font, str, size, tracking) => layout(font, str, size, tracking).width;

/**
 * Glyph outlines are defined once per font in <defs> (in font units) and
 * placed with <use>, which keeps text-heavy SVGs small. Call `resetGlyphs()`
 * before each file and embed `glyphDefs()` in it.
 */
const glyphs = new Map();
const fontIds = new Map(Object.values(F).map((font, i) => [font, `f${i}`]));
function resetGlyphs() {
  glyphs.clear();
}
function glyphDefs() {
  return [...glyphs.values()].join('');
}
function glyphRef(font, glyph) {
  const id = `${fontIds.get(font)}g${glyph.index}`;
  if (!glyphs.has(id)) {
    const d = toD(glyph.getPath(0, 0, font.unitsPerEm).commands);
    glyphs.set(id, d ? `<path id="${id}" d="${d}"/>` : '');
  }
  return glyphs.get(id) ? id : undefined;
}

/** Text with its baseline at y, as <use> references to glyph outlines. */
function text(
  font,
  str,
  x,
  y,
  size,
  { tracking = 0, anchor = 'start', fill = C.fg, opacity } = {},
) {
  const { glyphs: list, advances, width } = layout(font, str, size, tracking);
  let cx = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;
  const scale = size / font.unitsPerEm;
  let uses = '';
  list.forEach((g, i) => {
    const id = glyphRef(font, g);
    if (id)
      uses += `<use href="#${id}" transform="matrix(${num(scale * 1000) / 1000} 0 0 ${num(scale * 1000) / 1000} ${num(cx)} ${num(y)})"/>`;
    cx += advances[i];
  });
  const attrs = [`fill="${fill}"`];
  if (opacity != null) attrs.push(`fill-opacity="${opacity}"`);
  return `<g ${attrs.join(' ')}>${uses}</g>`;
}

/** Text made of differently coloured runs on one baseline. Returns { svg, width }. */
function runs(parts, x, y, size, font = F.mono) {
  let cx = x;
  let svg = '';
  for (const part of parts) {
    const f = part.font ?? font;
    if (part.text) svg += text(f, part.text, cx, y, size, { fill: part.fill ?? C.fgSoft });
    cx += measure(f, part.text, size);
  }
  return { svg, width: cx - x };
}

/** "ΔE 0.071", right-aligned at x. Geist has no Δ, so the triangle is drawn. */
function deltaE(value, x, y, size, fill) {
  const label = `E ${value}`;
  const w = measure(F.mono, label, size);
  const t = size * 0.62;
  const left = x - w - t - 1.5;
  const base = y;
  const tri = `<path d="M${num(left)} ${num(base)}L${num(left + t / 2)} ${num(base - size * 0.7)}L${num(left + t)} ${num(base)}Z" fill="none" stroke="${fill}" stroke-width="1.2" stroke-linejoin="round"/>`;
  return tri + text(F.mono, label, x, y, size, { anchor: 'end', fill });
}

/** A check mark drawn as a stroke (Geist has no ✓). */
function check(x, y, size, stroke) {
  const s = size / 16;
  return `<path d="M${num(x)} ${num(y - 6 * s)}l${num(4 * s)} ${num(4 * s)}l${num(8 * s)} ${num(-9 * s)}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
}

const escapeXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function write(name, svg) {
  fs.writeFileSync(path.join(OUT, name), `${svg.replace(/\n\s*/g, '\n').trim()}\n`);
  console.log('wrote', name, `${(Buffer.byteLength(svg) / 1024).toFixed(1)}kB`);
}

const frame = (W, H) => `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.ink}"/><stop offset="1" stop-color="#0f1a20"/></linearGradient>
    <radialGradient id="glow" cx=".85" cy=".1" r=".6"><stop offset="0" stop-color="${C.cyan}" stop-opacity=".10"/><stop offset="1" stop-color="${C.cyan}" stop-opacity="0"/></radialGradient>
    <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#fff" stroke-opacity=".035"/></pattern>
    <clipPath id="clip"><rect width="${W}" height="${H}" rx="18"/></clipPath>
  </defs>
  <g clip-path="url(#clip)">
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <rect width="${W}" height="${H}" fill="url(#grid)"/>
    <rect width="${W}" height="${H}" fill="url(#glow)"/>
  </g>
  <rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="17.5" fill="none" stroke="${C.edge}"/>`;

// ─── Hero: an agent calling check_ui ────────────────────────────────────────

async function hero() {
  const demo = path.join(root, 'examples/shadcn-demo');
  const ds = await loadDesignSystem(await loadConfig({ root: demo }), { cache: false });
  const file = 'app/settings/danger-zone.tsx';
  const draft = fs.readFileSync(path.join(demo, file), 'utf8');
  const result = ds.check(draft, file);
  assert.equal(result.errorCount, 8, 'hero expects the demo draft to have 8 errors');

  // What the agent writes after reading the diagnostics. Verified clean below.
  const fixed = applyFixes(draft, result.diagnostics)
    .replace('tone="warning"', 'variant="destructive"')
    .replace(
      ' style={{ color: "var(--muted-foreground)", marginTop: 6 }}',
      ' className="mt-1.5 text-muted-foreground"',
    )
    .replace(
      'import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"',
      'import {\n  Card,\n  CardContent,\n  CardDescription,\n  CardHeader,\n  CardTitle,\n} from "@/components/ui/card"',
    );
  const after = ds.check(fixed, file);
  assert.equal(
    after.diagnostics.length,
    0,
    `fixed draft should be clean: ${JSON.stringify(after.diagnostics)}`,
  );

  const shortRule = {
    'no-hardcoded-color': 'no-hardcoded-color',
    'no-hardcoded-spacing': 'no-hardcoded-spacing',
    'no-hardcoded-radius': 'no-hardcoded-radius',
    'prefer-design-system-component': 'prefer-ds-component',
    'no-unknown-component': 'no-unknown-component',
    'no-unknown-prop': 'no-unknown-prop',
    'no-unknown-variant': 'no-unknown-variant',
    'icon-button-accessible-name': 'icon-button-name',
  };
  const rows = result.diagnostics.map((d) => {
    let found = d.source;
    let fix = d.suggestion ?? '';
    if (d.ruleId === 'icon-button-accessible-name') found = '<Button size="icon">';
    else if (d.ruleId === 'prefer-design-system-component') found = `<${d.source}>`;
    else if (d.ruleId === 'no-unknown-component') found = `<${d.source}>`;
    else if (d.ruleId === 'no-unknown-prop') found = `${d.source}=`;
    else if (d.ruleId === 'no-unknown-variant') found = `variant=${d.source}`;
    else if (d.ruleId === 'no-hardcoded-spacing' && /^\d+$/.test(d.source))
      found = `marginTop: ${d.source}`;
    else if (d.source.startsWith('#')) found = `color: "${d.source}"`;
    if (d.ruleId === 'no-unknown-prop') fix = `${fix}=`;
    const delta = /ΔE (\d\.\d+)|exact match/.exec(d.message);
    const note = delta ? (delta[1] ?? '0') : '';
    return {
      loc: `${d.line}:${d.column}`,
      error: d.severity === 'error',
      rule: shortRule[d.ruleId],
      found,
      fix,
      note,
    };
  });

  const W = 1200;
  const X = 44;
  const size = 17;
  const lh = 31;
  const charW = measure(F.mono, 'M', size);
  const parts = [];

  // Title bar
  parts.push(`<rect x="1" y="1" width="${W - 2}" height="46" rx="17" fill="${C.raisedSoft}"/>`);
  parts.push(`<rect x="1" y="30" width="${W - 2}" height="17" fill="${C.raisedSoft}"/>`);
  parts.push(`<path d="M1 47.5H${W - 1}" stroke="${C.edge}"/>`);
  [0, 1, 2].forEach((i) =>
    parts.push(`<circle cx="${28 + i * 20}" cy="24" r="6" fill="${C.edgeStrong}"/>`),
  );
  parts.push(
    text(F.mono, '~/acme-app — agent session', W / 2, 29, 14, { anchor: 'middle', fill: C.subtle }),
  );

  // Prompt
  let y = 98;
  parts.push(text(F.monoMedium, '›', X, y, size + 2, { fill: C.cyan }));
  parts.push(
    text(F.mono, 'Add a danger-zone card to the workspace settings page', X + 26, y, size, {
      fill: C.fg,
    }),
  );

  // Agent steps
  y += lh + 14;
  parts.push(`<circle cx="${X + 6}" cy="${y - 6}" r="4.5" fill="${C.subtle}"/>`);
  parts.push(
    runs(
      [
        { text: 'Write ', fill: C.muted },
        { text: file, fill: C.fgSoft },
        { text: '  +28 lines', fill: C.subtle },
      ],
      X + 26,
      y,
      size,
    ).svg,
  );
  y += lh + 6;
  parts.push(`<circle cx="${X + 6}" cy="${y - 6}" r="4.5" fill="${C.cyan}"/>`);
  parts.push(
    runs(
      [
        { text: 'design-system', fill: C.cyanBright, font: F.monoMedium },
        { text: ' · ', fill: C.subtle },
        { text: 'check_ui', fill: C.cyanBright, font: F.monoMedium },
        { text: `  (path: "${file}")`, fill: C.muted },
      ],
      X + 26,
      y,
      size,
    ).svg,
  );

  // Result panel
  y += 20;
  const panelX = X + 26;
  const panelW = W - panelX - X;
  const headerH = 46;
  const panelH = headerH + rows.length * lh + 22;
  parts.push(
    `<rect x="${panelX}" y="${y}" width="${panelW}" height="${panelH}" rx="12" fill="${C.raised}" stroke="${C.edge}"/>`,
  );
  const hy = y + 30;
  const header = runs(
    [
      { text: `${result.errorCount} errors`, fill: C.magenta, font: F.monoMedium },
      { text: ' · ', fill: C.subtle },
      { text: `${result.warningCount} warnings`, fill: C.cyan, font: F.monoMedium },
      { text: '  each with a rule id, a location and a fix', fill: C.subtle },
    ],
    panelX + 22,
    hy,
    15,
  );
  parts.push(header.svg);
  parts.push(`<path d="M${panelX} ${y + headerH - 0.5}H${panelX + panelW}" stroke="${C.edge}"/>`);

  const col = {
    dot: panelX + 24,
    loc: panelX + 40,
    rule: panelX + 40 + charW * 7,
    found: panelX + 40 + charW * 29,
  };
  let ry = y + headerH + 30;
  for (const row of rows) {
    const tone = row.error ? C.magenta : C.cyan;
    parts.push(`<circle cx="${col.dot}" cy="${ry - 5.5}" r="3.5" fill="${tone}"/>`);
    parts.push(text(F.mono, row.loc, col.loc, ry, 15, { fill: C.subtle }));
    parts.push(text(F.mono, row.rule, col.rule, ry, 15, { fill: C.muted }));
    const line = runs(
      [
        { text: row.found, fill: C.fgSoft },
        { text: '  →  ', fill: C.subtle },
        { text: row.fix, fill: C.cyanBright },
      ],
      col.found,
      ry,
      15,
    );
    parts.push(line.svg);
    if (row.note) parts.push(deltaE(row.note, panelX + panelW - 22, ry, 14, C.subtle));
    ry += lh;
  }

  // Outcome
  y += panelH + 44;
  parts.push(`<circle cx="${X + 6}" cy="${y - 6}" r="4.5" fill="${C.subtle}"/>`);
  parts.push(
    runs(
      [
        { text: 'Edit ', fill: C.muted },
        { text: file, fill: C.fgSoft },
        { text: `  resolved all ${result.diagnostics.length} findings`, fill: C.subtle },
      ],
      X + 26,
      y,
      size,
    ).svg,
  );
  y += lh + 6;
  parts.push(`<circle cx="${X + 6}" cy="${y - 6}" r="4.5" fill="${C.cyan}"/>`);
  const done = runs(
    [{ text: 'check_ui', fill: C.cyanBright, font: F.monoMedium }],
    X + 26,
    y,
    size,
  );
  parts.push(done.svg);
  parts.push(check(X + 26 + done.width + 18, y, size, C.cyan));
  parts.push(
    text(F.mono, 'no design-system problems', X + 26 + done.width + 42, y, size, {
      fill: C.fgSoft,
    }),
  );
  const H = y + 40;

  const desc = `An agent writes ${file}, calls the check_ui tool and gets ${result.errorCount} errors and ${result.warningCount} warnings, each with a fix: ${rows
    .map((r) => `${r.found} → ${r.fix}`)
    .join('; ')}. After applying them, check_ui reports no problems.`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="t d">
  <title id="t">design-system-mcp: an agent checks its UI against the design system</title>
  <desc id="d">${escapeXml(desc)}</desc>
  <defs>${glyphDefs()}</defs>
  ${frame(W, H)}
  ${parts.join('\n')}
</svg>`;
}

// ─── Architecture ───────────────────────────────────────────────────────────

function architecture() {
  const W = 1200;
  const H = 590;
  const parts = [];
  const PAD = 18;

  const fits = (font, str, size, x, max) => {
    const width = measure(font, str, size);
    if (x + width > max)
      throw new Error(`"${str}" overflows its box by ${Math.ceil(x + width - max)}px`);
  };
  const box = (x, y, w, h, title, lines, { accent = false } = {}) => {
    parts.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${C.raised}" stroke="${accent ? '#1d4a55' : C.edge}"/>`,
    );
    fits(F.sansSemibold, title, 17, x + PAD, x + w - 12);
    parts.push(
      text(F.sansSemibold, title, x + PAD, y + 31, 17, { fill: accent ? C.cyanBright : C.fg }),
    );
    lines.forEach((line, i) => {
      fits(F.mono, line, 14, x + PAD, x + w - 12);
      parts.push(text(F.mono, line, x + PAD, y + 57 + i * 22, 14, { fill: C.muted }));
    });
    return { x, y, w, h, cy: y + h / 2, right: x + w, bottom: y + h };
  };
  const chip = (x, y, w, title, sub) => {
    parts.push(
      `<rect x="${x}" y="${y}" width="${w}" height="58" rx="9" fill="${C.ink}" stroke="${C.edge}"/>`,
    );
    fits(F.sansMedium, title, 15, x + 14, x + w - 10);
    fits(F.mono, sub, 13, x + 14, x + w - 10);
    parts.push(text(F.sansMedium, title, x + 14, y + 24, 15, { fill: C.fgSoft }));
    parts.push(text(F.mono, sub, x + 14, y + 45, 13, { fill: C.subtle }));
  };
  const label = (str, x, y) =>
    parts.push(text(F.monoMedium, str, x, y, 13, { tracking: 1.6, fill: C.subtle }));
  const arrow = (x1, y1, x2, y2, { hot = false } = {}) => {
    const mx = (x1 + x2) / 2;
    const stroke = hot ? C.cyan : C.edgeStrong;
    parts.push(
      `<path d="M${x1} ${y1}C${mx} ${y1} ${mx} ${y2} ${x2 - 8} ${y2}" fill="none" stroke="${stroke}" stroke-width="1.6"/>`,
    );
    parts.push(
      `<path d="M${x2 - 9} ${y2 - 4.5}L${x2} ${y2}L${x2 - 9} ${y2 + 4.5}Z" fill="${stroke}"/>`,
    );
  };

  const top = 92;
  const col = { src: 40, ext: 326, model: 622, out: 902 };
  label('YOUR DESIGN SYSTEM', col.src, 64);
  label('EXTRACT', col.ext, 64);
  label('MODEL', col.model, 64);
  label('INTERFACES', col.out, 64);

  const sources = [
    box(col.src, top, 252, 84, 'Components', ['components/ui/*.tsx']),
    box(col.src, top + 104, 252, 84, 'Tokens', ['globals.css', '*.tokens.json (DTCG)']),
    box(col.src, top + 208, 252, 84, 'Docs', ['docs/*.md, *.mdx']),
    box(col.src, top + 312, 252, 84, 'Config (optional)', ['design-system-mcp.config']),
  ];
  const extractors = [
    box(col.ext, top, 262, 84, 'TypeScript checker', ['props, defaults, JSDoc']),
    box(col.ext, top + 104, 262, 84, 'cva() / tv() parser', ['variants and classes']),
    box(col.ext, top + 208, 262, 84, 'Token parsers', ['DTCG · CSS vars · @theme']),
    box(col.ext, top + 312, 262, 84, 'Docs parser', ['guidelines, examples']),
  ];
  const model = box(
    col.model,
    top,
    246,
    396,
    'Design-system model',
    ['components, tokens,', 'docs; cached on disk,', 'rebuilt on change'],
    {
      accent: true,
    },
  );
  chip(col.model + 16, top + 148, 214, 'BM25 index', 'intent search');
  chip(col.model + 16, top + 222, 214, 'Token index', 'nearest color, OKLCH');
  chip(col.model + 16, top + 296, 214, 'Lint rules', '8 rules, with fixes');

  const server = box(
    col.out,
    top,
    258,
    250,
    'MCP server · stdio',
    [
      'list_components',
      'get_component',
      'search_components',
      'get_tokens',
      'check_ui',
      'ds://components/{name}',
      'ds://tokens',
    ],
    { accent: true },
  );
  const cli = box(col.out, top + 270, 258, 126, 'CLI · CI', [
    'design-system-mcp check',
    'exit 1 on errors',
    '--format github',
  ]);

  sources.forEach((source, i) => arrow(source.right, source.cy, extractors[i].x, extractors[i].cy));
  extractors.forEach((extractor, i) =>
    arrow(extractor.right, extractor.cy, model.x, top + 70 + i * 86),
  );
  arrow(model.right, top + 125, server.x, server.cy, { hot: true });
  arrow(model.right, top + 325, cli.x, cli.cy);

  // Consumers
  const baseline = H - 50;
  parts.push(`<path d="M40 ${baseline - 36}H${W - 40}" stroke="${C.edge}"/>`);
  parts.push(
    runs(
      [
        { text: 'Used by  ', fill: C.subtle, font: F.monoMedium },
        { text: 'Claude Code · Cursor · VS Code · any MCP client', fill: C.fgSoft },
        { text: '   and   ', fill: C.subtle },
        { text: 'CI (GitHub annotations, exit codes)', fill: C.fgSoft },
      ],
      40,
      baseline,
      15,
    ).svg,
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="t d">
  <title id="t">design-system-mcp architecture</title>
  <defs>${glyphDefs()}</defs>
  <desc id="d">Component sources, tokens, docs and config are read by the TypeScript checker, a cva/tv parser, token parsers and a docs parser into a design-system model that is cached on disk and rebuilt on change, with a BM25 index, an OKLCH token index and the lint rules. The model is served to agents by an MCP server over stdio (five tools, two resources) and to CI by the check CLI.</desc>
  ${frame(W, H)}
  ${parts.join('\n')}
</svg>`;
}

resetGlyphs();
write('hero.svg', await hero());
resetGlyphs();
write('architecture.svg', architecture());
