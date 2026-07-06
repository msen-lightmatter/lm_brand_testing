(function () {
  'use strict';

  // Expand the TOC rail on hover (matches the brand site's shared.js initTocRail —
  // reimplemented here rather than depending on assets/js/shared.js, which this
  // standalone page doesn't otherwise need).
  (function initTocRail() {
    var postTocInner = document.querySelector('.post-toc-inner');
    var tocRail = document.getElementById('toc-rail');
    if (!tocRail || !postTocInner) return;
    var collapseTimer;
    tocRail.addEventListener('mouseenter', function () {
      clearTimeout(collapseTimer);
      postTocInner.classList.add('toc-hover');
    });
    tocRail.addEventListener('mouseleave', function () {
      collapseTimer = setTimeout(function () {
        postTocInner.classList.remove('toc-hover');
      }, 250);
    });
  })();

  // Hamburger dropdown for the top nav (matches the brand site's shared.js initMobileMenu —
  // reimplemented here for the same reason as initTocRail above).
  (function initMobileMenu() {
    var btn = document.getElementById('menu-toggle');
    var menu = document.getElementById('mobile-menu');
    if (!btn || !menu) return;
    var iconOpen = btn.querySelector('.icon-open');
    var iconClose = btn.querySelector('.icon-close');
    function setOpen(open) {
      menu.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      menu.setAttribute('aria-hidden', open ? 'false' : 'true');
      iconOpen.classList.toggle('hidden', open);
      iconClose.classList.toggle('hidden', !open);
    }
    btn.addEventListener('click', function () {
      setOpen(!menu.classList.contains('is-open'));
    });
    menu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { setOpen(false); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setOpen(false);
    });
    document.addEventListener('click', function (e) {
      if (!menu.classList.contains('is-open')) return;
      if (menu.contains(e.target) || btn.contains(e.target)) return;
      setOpen(false);
    });
  })();

  var canvas = document.getElementById('type-canvas');   // real, native contenteditable — text kept invisible
  var preview = document.getElementById('type-preview'); // decorative mirror — shows the styled text
  var canvasWrap = document.getElementById('canvas-wrap');
  var sizeSlider = document.getElementById('size-slider');
  var sizeValue = document.getElementById('size-value');
  var trackingSlider = document.getElementById('tracking-slider');
  var trackingValue = document.getElementById('tracking-value');
  var leadingSlider = document.getElementById('leading-slider');
  var leadingValue = document.getElementById('leading-value');
  var statusEl = document.getElementById('export-status');
  var svgBtn = document.getElementById('download-svg');
  var pngBtn = document.getElementById('download-png');

  var featureIds = ['salt', 'ss01', 'ss02'];
  // 'l' is intentionally excluded — its alternate form is never used.
  var ALT_CHARS = new Set(['a', 'b', 'e', 'f', 'g', 'i', 'j', 'k', 'm', 'n', 'q', 'r', 't', 'u', 'v', 'w', 'x', 'y', 'z']);

  var state = {
    color: '#000000',
    bg: 'white',
    scale: 2,
    altMode: 'none', // 'none' | '1' | '2' | '3' | 'random' — which eligible letter gets swapped per word
    letterSpacing: -0.04, // em — matches the Display 1 preset, the default size preset
    lineHeight: 1.0,       // multiplier
    keepers: new Set(),   // "lineIndex:charIndex" — the single eligible letter chosen per qualifying word
  };

  var font = null; // opentype.js Font, loaded lazily
  var subMaps = {}; // feature tag -> Map<inputGlyphIndex, outputGlyphIndex>

  // ── Color / background / scale controls ─────────────────────────────────

  document.querySelectorAll('#text-color-swatches .swatch').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('#text-color-swatches .swatch').forEach(function (b) {
        b.setAttribute('aria-pressed', 'false');
      });
      btn.setAttribute('aria-pressed', 'true');
      state.color = btn.dataset.color;
      preview.style.color = state.color;
      canvas.style.caretColor = state.color;
      // Same-color text-on-background would be invisible — switch the background automatically.
      if (state.color === '#ffffff' && state.bg === 'white') {
        document.querySelector('#bg-buttons .seg-btn[data-bg="black"]').click();
      } else if (state.color === '#000000' && state.bg === 'black') {
        document.querySelector('#bg-buttons .seg-btn[data-bg="white"]').click();
      }
      updateDownloadState();
    });
  });

  document.querySelectorAll('#bg-buttons .seg-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('#bg-buttons .seg-btn').forEach(function (b) {
        b.setAttribute('aria-pressed', 'false');
      });
      btn.setAttribute('aria-pressed', 'true');
      state.bg = btn.dataset.bg;
      applyPreviewBackground();
      // Same-color text-on-background would be invisible — switch the text color automatically.
      if (state.bg === 'black' && state.color === '#000000') {
        document.querySelector('#text-color-swatches .swatch[data-color="#ffffff"]').click();
      } else if (state.bg === 'white' && state.color === '#ffffff') {
        document.querySelector('#text-color-swatches .swatch[data-color="#000000"]').click();
      }
    });
  });

  document.querySelectorAll('#scale-buttons .seg-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('#scale-buttons .seg-btn').forEach(function (b) {
        b.setAttribute('aria-pressed', 'false');
      });
      btn.setAttribute('aria-pressed', 'true');
      state.scale = parseInt(btn.dataset.scale, 10);
    });
  });

  document.querySelectorAll('#altmode-buttons .seg-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (btn.disabled) return;
      document.querySelectorAll('#altmode-buttons .seg-btn').forEach(function (b) {
        b.setAttribute('aria-pressed', 'false');
      });
      btn.setAttribute('aria-pressed', 'true');
      state.altMode = btn.dataset.mode;
      onTextChanged(); // which letter(s) get picked depends on the mode — recompute keepers
    });
  });

  // Reset every styling control back to its default (Display 1) and restore the seed phrase.
  document.getElementById('reset-controls').addEventListener('click', function () {
    document.querySelector('#text-color-swatches .swatch[data-color="#000000"]').click();
    document.querySelector('#bg-buttons .seg-btn[data-bg="white"]').click();
    document.querySelector('#preset-buttons .seg-btn[data-preset="display1"]').click();
    document.querySelector('#scale-buttons .seg-btn[data-scale="2"]').click();
    document.querySelector('#altmode-buttons .seg-btn[data-mode="none"]').click();
    canvas.textContent = SEED_PHRASE;
    hasClearedSeedText = false; // clicking back into the canvas clears it again, like on first load
    onTextChanged();
  });

  function applySizeFromSlider() {
    canvas.style.fontSize = sizeSlider.value + 'px';
    preview.style.fontSize = sizeSlider.value + 'px';
    sizeValue.textContent = sizeSlider.value + 'px';
  }

  function applyTrackingFromSlider() {
    state.letterSpacing = parseFloat(trackingSlider.value);
    trackingValue.textContent = Math.round(state.letterSpacing * 100) + '%';
    canvas.style.letterSpacing = state.letterSpacing + 'em';
    preview.style.letterSpacing = state.letterSpacing + 'em';
  }

  function applyLeadingFromSlider() {
    state.lineHeight = parseFloat(leadingSlider.value);
    leadingValue.textContent = Math.round(state.lineHeight * 100) + '%';
    canvas.style.lineHeight = state.lineHeight;
    preview.style.lineHeight = state.lineHeight;
  }

  function markPresetCustom() {
    document.querySelectorAll('#preset-buttons .seg-btn').forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.preset === 'custom' ? 'true' : 'false');
    });
  }

  // Only genuine user drags on the sliders fall back to "Custom" — preset clicks below set
  // slider values directly and call the apply* functions themselves, never via these listeners.
  sizeSlider.addEventListener('input', function () { applySizeFromSlider(); markPresetCustom(); });
  trackingSlider.addEventListener('input', function () { applyTrackingFromSlider(); markPresetCustom(); });
  leadingSlider.addEventListener('input', function () { applyLeadingFromSlider(); markPresetCustom(); });

  var SIZE_PRESETS = {
    // Lightmatter brand type scale, all -4% letter spacing.
    display1: { size: 119, tracking: -0.04, leading: 1.0 },
    display2: { size: 95, tracking: -0.04, leading: 1.0 },
    display3: { size: 76, tracking: -0.04, leading: 1.1 },
    display4: { size: 61, tracking: -0.04, leading: 1.1 },
  };

  document.querySelectorAll('#preset-buttons .seg-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('#preset-buttons .seg-btn').forEach(function (b) {
        b.setAttribute('aria-pressed', 'false');
      });
      btn.setAttribute('aria-pressed', 'true');
      var preset = SIZE_PRESETS[btn.dataset.preset];
      if (!preset) return; // "Custom" — just switches mode, current slider values stand
      sizeSlider.value = preset.size;
      trackingSlider.value = preset.tracking;
      leadingSlider.value = preset.leading;
      applySizeFromSlider();
      applyTrackingFromSlider();
      applyLeadingFromSlider();
    });
  });

  // The real input is left completely native — no DOM rewriting, no Enter
  // interception — so typing, line breaks, and caret behavior are 100%
  // browser-default. We only ever read its text (via innerText) to drive
  // the decorative preview layer underneath.
  canvas.addEventListener('input', onTextChanged);

  // First click clears the seed demo phrase so the user can type straight away.
  var SEED_PHRASE = 'A GIANT LEAP';
  var hasClearedSeedText = false;
  canvas.addEventListener('focus', function () {
    if (hasClearedSeedText) return;
    hasClearedSeedText = true;
    canvas.textContent = '';
    onTextChanged();
  });

  function applyPreviewBackground() {
    if (state.bg === 'white') {
      canvasWrap.style.background = '#ffffff';
    } else if (state.bg === 'black') {
      canvasWrap.style.background = '#000000';
    } else {
      canvasWrap.style.background =
        'repeating-conic-gradient(#e5e5e5 0% 25%, #ffffff 0% 50%) 50% / 16px 16px';
    }
  }

  // ── Text extraction ──────────────────────────────────────────────────────

  function getLines() {
    return canvas.innerText.replace(/\r/g, '').split('\n');
  }

  var fontLoadError = false;

  function updateDownloadState() {
    var hasText = getLines().some(function (l) { return l.trim().length > 0; });
    var ready = !!font;
    svgBtn.disabled = !(hasText && ready);
    pngBtn.disabled = !(hasText && ready);
    if (fontLoadError) return; // leave the error message in place
    if (!hasText) {
      statusEl.textContent = 'Type something to download';
      statusEl.hidden = false;
    } else {
      statusEl.textContent = '';
      statusEl.hidden = true;
    }
  }

  applyPreviewBackground();
  // Sync the canvas/preview inline styles to the sliders' default values (Display 1).
  applySizeFromSlider();
  applyTrackingFromSlider();
  applyLeadingFromSlider();

  // ── Keeper selection: one eligible letter per word 3+ chars long ──

  // Returns one entry per qualifying word (3+ chars): { li, wordLen, candidates: [ci, ...] }.
  function getQualifyingWords(lines) {
    var words = [];
    lines.forEach(function (line, li) {
      var chars = Array.from(line);
      var wordStart = null;
      function commitWord(end) {
        if (wordStart === null) return;
        var wordLen = end - wordStart;
        if (wordLen >= 3) {
          var candidates = [];
          for (var ci = wordStart; ci < end; ci++) {
            if (ALT_CHARS.has(chars[ci].toLowerCase())) candidates.push(ci);
          }
          words.push({ li: li, wordLen: wordLen, candidates: candidates });
        }
        wordStart = null;
      }
      for (var ci = 0; ci < chars.length; ci++) {
        if (/[a-zA-Z]/.test(chars[ci])) {
          if (wordStart === null) wordStart = ci;
        } else {
          commitWord(ci);
        }
      }
      commitWord(chars.length);
    });
    return words;
  }

  // How many, and which, candidate letters get swapped for one word under the current mode.
  function pickCandidateIndices(word) {
    var howMany = (word.wordLen > 8 && word.candidates.length > 1) ? 2 : 1;
    if (state.altMode === 'random') {
      var pool = word.candidates.slice();
      var picks = [];
      for (var i = 0; i < howMany && pool.length; i++) {
        var pick = Math.floor(Math.random() * pool.length);
        picks.push(pool[pick]);
        pool.splice(pick, 1);
      }
      return picks;
    }
    var optionIndex = parseInt(state.altMode, 10) - 1; // 0-based position among eligible candidates
    // If the word doesn't have that many eligible letters, this option simply has no effect
    // on this word (rather than wrapping around and coinciding with an earlier letter).
    if (optionIndex >= word.candidates.length) return [];
    var result = [word.candidates[optionIndex]];
    if (howMany > 1) {
      // Second swap spreads apart from the first rather than sitting adjacent to it, so the
      // effect reads across the whole word.
      var secondIndex = (optionIndex + Math.ceil(word.candidates.length / 2)) % word.candidates.length;
      if (secondIndex !== optionIndex) result.push(word.candidates[secondIndex]);
    }
    return result;
  }

  function computeKeepers(lines) {
    var keepers = new Set();
    if (state.altMode === 'none') return keepers;
    getQualifyingWords(lines).forEach(function (word) {
      pickCandidateIndices(word).forEach(function (ci) { keepers.add(word.li + ':' + ci); });
    });
    return keepers;
  }

  // Grey out (and disable) any option that wouldn't change a single letter in the current
  // phrase: V1/V2/V3 need at least that many eligible letters in some word; "Random" just
  // needs at least one. "None" has no such dependency and always stays enabled.
  function setOptionAvailability(btn, available) {
    btn.disabled = !available;
    btn.classList.toggle('opacity-40', !available);
    btn.style.cursor = available ? '' : 'not-allowed';
    // If the currently active mode just became unavailable, fall back to "None" rather than
    // leaving a disabled button stuck showing as selected. Updated directly (not via .click())
    // since this runs inside onTextChanged() itself, which will pick up the corrected
    // state.altMode when it reaches computeKeepers() right after this returns.
    if (!available && btn.getAttribute('aria-pressed') === 'true') {
      btn.setAttribute('aria-pressed', 'false');
      document.querySelector('#altmode-buttons .seg-btn[data-mode="none"]').setAttribute('aria-pressed', 'true');
      state.altMode = 'none';
    }
  }

  function updateOptionAvailability(lines) {
    var words = getQualifyingWords(lines);
    var maxCandidates = words.reduce(function (max, w) { return Math.max(max, w.candidates.length); }, 0);
    [1, 2, 3].forEach(function (n) {
      setOptionAvailability(document.getElementById('alt-' + n), n <= maxCandidates);
    });
    setOptionAvailability(document.querySelector('#altmode-buttons .seg-btn[data-mode="random"]'), maxCandidates > 0);
  }

  // ── Decorative preview rendering (span-wraps only the chosen keeper letters) ──

  function activeFeatureCss() {
    if (state.altMode === 'none') return '';
    // The option controls WHICH letter is picked (see computeKeepers); once picked, turn on
    // every alternate-glyph feature the font has — whichever one actually substitutes this
    // particular glyph wins, the rest are no-ops.
    return featureIds.map(function (tag) { return '"' + tag + '" 1'; }).join(', ');
  }

  function escapeHtml(ch) {
    if (ch === '&') return '&amp;';
    if (ch === '<') return '&lt;';
    if (ch === '>') return '&gt;';
    return ch;
  }

  function renderPreview(lines) {
    var css = activeFeatureCss();
    var html = lines.map(function (line, li) {
      var chars = Array.from(line);
      return chars.map(function (ch, ci) {
        var esc = escapeHtml(ch);
        if (css && state.keepers.has(li + ':' + ci)) {
          // Single-quote the attribute — css contains double-quoted feature tags (e.g. "salt" 1),
          // which would otherwise prematurely terminate a double-quoted style="..." attribute.
          return '<span class="stylistic-alt" style=\'font-feature-settings:' + css + '\'>' + esc + '</span>';
        }
        return esc;
      }).join('');
    }).join('<br>');
    preview.innerHTML = html;
  }

  function onTextChanged() {
    var lines = getLines();
    updateOptionAvailability(lines);
    state.keepers = computeKeepers(lines);
    renderPreview(lines);
    updateDownloadState();
  }

  // Initialize the preview for the default phrase already in the markup.
  onTextChanged();

  // ── Font engine: load TTF, build GSUB single-substitution maps ─────────

  function buildSubMap(tag) {
    var map = new Map();
    try {
      var subs = font.substitution.getSingle(tag);
      subs.forEach(function (s) { map.set(s.sub, s.by); });
    } catch (e) {
      // feature not present in this font — leave map empty
    }
    return map;
  }

  function base64ToArrayBuffer(base64) {
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  function loadFont() {
    statusEl.textContent = '';
    statusEl.hidden = true;
    try {
      // Embedded as base64 (assets/fonts/inference-sans-ttf-base64.js) rather than fetched,
      // so the tool works when opened directly as a file (double-click from Drive) —
      // fetch() of local files is blocked by browsers under file://.
      var buffer = base64ToArrayBuffer(window.INFERENCE_SANS_TTF_BASE64);
      font = window.opentype.parse(buffer);
      featureIds.forEach(function (tag) { subMaps[tag] = buildSubMap(tag); });
      updateDownloadState();
    } catch (err) {
      fontLoadError = true;
      statusEl.textContent = 'Could not load font engine';
      statusEl.hidden = false;
      console.error(err);
    }
  }

  loadFont();

  // ── SVG building (shared by SVG + PNG export) ───────────────────────────

  function resolveGlyph(ch, li, ci) {
    var glyph = font.charToGlyph(ch);
    if (!state.keepers.has(li + ':' + ci)) return glyph;
    // Matches activeFeatureCss(): try every alternate-glyph feature the font has, first match wins.
    for (var i = 0; i < featureIds.length; i++) {
      var map = subMaps[featureIds[i]];
      if (map && map.has(glyph.index)) {
        return font.glyphs.get(map.get(glyph.index));
      }
    }
    return glyph;
  }

  function translatePath(path, dx, dy) {
    path.commands.forEach(function (cmd) {
      if (cmd.x !== undefined) cmd.x += dx;
      if (cmd.y !== undefined) cmd.y += dy;
      if (cmd.x1 !== undefined) cmd.x1 += dx;
      if (cmd.y1 !== undefined) cmd.y1 += dy;
      if (cmd.x2 !== undefined) cmd.x2 += dx;
      if (cmd.y2 !== undefined) cmd.y2 += dy;
    });
  }

  function buildSVG(fontSize) {
    var lines = getLines();
    var fontScale = 1 / font.unitsPerEm * fontSize;
    var ascender = (font.ascender || font.unitsPerEm * 0.8) * fontScale;
    var descender = (font.descender || -font.unitsPerEm * 0.2) * fontScale;
    var lineHeight = (ascender - descender) * state.lineHeight;
    var padding = 2;
    var trackingPx = state.letterSpacing * fontSize;

    var lineData = lines.map(function (line, li) {
      var chars = Array.from(line);
      var glyphs = chars.map(function (ch, ci) { return resolveGlyph(ch, li, ci); });
      var x = 0;
      var positioned = [];
      for (var j = 0; j < glyphs.length; j++) {
        positioned.push({ glyph: glyphs[j], x: x });
        x += glyphs[j].advanceWidth * fontScale;
        if (j < glyphs.length - 1) {
          x += font.getKerningValue(glyphs[j], glyphs[j + 1]) * fontScale;
          x += trackingPx;
        }
      }
      return { glyphs: positioned, width: x };
    });

    var maxWidth = Math.max.apply(null, lineData.map(function (l) { return l.width; }).concat([1]));

    // First pass at provisional (unpadded) positions, purely to measure the true ink
    // bounding box — font ascender/descender metrics leave a lot of unused vertical
    // space above/below the actual glyph shapes (especially for all-caps text), so we
    // crop to what's actually drawn rather than to the font's typographic line box.
    var glyphPaths = [];
    var bbox = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
    lineData.forEach(function (line, lineIndex) {
      var baseline = ascender + lineIndex * lineHeight;
      var offsetX = (maxWidth - line.width) / 2; // center-align each line
      line.glyphs.forEach(function (g) {
        var glyphPath = g.glyph.getPath(offsetX + g.x, baseline, fontSize);
        // Glyphs with no ink (space, etc.) have zero path commands. opentype.js's
        // getBoundingBox() special-cases that empty case by returning a degenerate box
        // at the absolute origin (0,0) rather than an empty/infinite one — which, left
        // unguarded, drags the computed top-left corner toward (0,0) and produces
        // exactly the lopsided extra padding on the top/left we were seeing.
        if (glyphPath.commands.length > 0) {
          var pathBox = glyphPath.getBoundingBox();
          bbox.x1 = Math.min(bbox.x1, pathBox.x1);
          bbox.y1 = Math.min(bbox.y1, pathBox.y1);
          bbox.x2 = Math.max(bbox.x2, pathBox.x2);
          bbox.y2 = Math.max(bbox.y2, pathBox.y2);
        }
        glyphPaths.push(glyphPath);
      });
    });
    if (!isFinite(bbox.x1)) { bbox = { x1: 0, y1: 0, x2: maxWidth, y2: lineHeight }; } // blank glyphs (e.g. all spaces)

    var shiftX = padding - bbox.x1;
    var shiftY = padding - bbox.y1;
    // Round once and reuse the SAME integer for both the width/height attributes and the
    // viewBox. If those two ever disagree on aspect ratio (e.g. width/height ceil'd but the
    // viewBox left fractional), the SVG's default preserveAspectRatio="xMidYMid meet"
    // letterboxes the content to compensate — which is exactly what produced the uneven
    // padding: extra space added to only one axis instead of split evenly on both sides.
    var svgWidth = Math.round((bbox.x2 - bbox.x1) + padding * 2);
    var svgHeight = Math.round((bbox.y2 - bbox.y1) + padding * 2);

    var pathEls = glyphPaths.map(function (glyphPath) {
      translatePath(glyphPath, shiftX, shiftY);
      var d = glyphPath.toPathData(2);
      return d ? '<path d="' + d + '"/>' : '';
    });

    var bgRect = '';
    if (state.bg === 'white') bgRect = '<rect width="100%" height="100%" fill="#ffffff"/>';
    if (state.bg === 'black') bgRect = '<rect width="100%" height="100%" fill="#000000"/>';

    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + svgWidth + '" height="' + svgHeight + '" ' +
      'viewBox="0 0 ' + svgWidth + ' ' + svgHeight + '">' +
      bgRect +
      '<g fill="' + state.color + '">' + pathEls.join('') + '</g>' +
      '</svg>';

    return { svg: svg, width: svgWidth, height: svgHeight };
  }

  function slugify(text) {
    var s = text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return s || 'phrase';
  }

  var COLOR_NAMES = { '#000000': 'black', '#ffffff': 'white', '#FF3300': 'red' };
  var PRESET_NAMES = { display1: 'd1', display2: 'd2', display3: 'd3', display4: 'd4', custom: 'custom' };

  function buildFilename(ext, includeScale) {
    var colorName = COLOR_NAMES[state.color] || slugify(state.color);
    var presetBtn = document.querySelector('#preset-buttons .seg-btn[aria-pressed="true"]');
    var presetName = (presetBtn && PRESET_NAMES[presetBtn.dataset.preset]) || 'custom';
    var parts = ['itt', slugify(getLines().join(' ')), colorName, state.bg, presetName];
    var name = parts.join('-');
    if (includeScale) name += '@' + state.scale + 'x';
    return name + '.' + ext;
  }

  function triggerDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  var EXPORT_FONT_SIZE = 200; // fixed base size for exports; visual size is set by scale, not the on-screen slider

  svgBtn.addEventListener('click', function () {
    var built = buildSVG(EXPORT_FONT_SIZE);
    var blob = new Blob([built.svg], { type: 'image/svg+xml' });
    triggerDownload(blob, buildFilename('svg', false));
  });

  pngBtn.addEventListener('click', function () {
    var built = buildSVG(EXPORT_FONT_SIZE);
    var scale = state.scale;
    var img = new Image();
    var svgBlob = new Blob([built.svg], { type: 'image/svg+xml' });
    var url = URL.createObjectURL(svgBlob);
    img.onload = function () {
      var c = document.createElement('canvas');
      c.width = Math.ceil(built.width * scale);
      c.height = Math.ceil(built.height * scale);
      var ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(function (blob) {
        triggerDownload(blob, buildFilename('png', true));
      }, 'image/png');
    };
    img.src = url;
  });

})();
