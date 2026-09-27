/**
 * Quick Scan Button — a bordered button with four corner marks and a scanning
 * rule, rebuilt from https://scanbutton.framer.website/ ("Button One").
 *
 * Every number below was measured off the reference at 1728px, not eyeballed:
 *
 *   box             160.79 x 67 with padding 24px 30px   (24 + 19.2 + 24 = 67.2)
 *   corner mark     11 x 11, centred on each corner, so 5px outside it
 *   mark strokes    1px, crossing at the mark's centre so it reads as a "+"
 *                   (variant two keeps the marks inside and the strokes on the
 *                   mark's outer edge, which reads as a bracket instead)
 *   box rules       1px, white at opacity .1 — NOT the accent colour
 *   corner strokes  rgb(255, 0, 0) at full opacity
 *   label           16px / 1.2, weight 500, font-style normal, white
 *   well            19px tall, overflow clipped, two copies stacked
 *   scan rule       1px at bottom:-2px, accent at opacity .1 at rest;
 *                   on hover it fills the box at opacity 1
 *
 * The reference drives its motion from Framer's runtime and ships no CSS
 * transitions for it, so the timing here is ours: one duration and one ease for
 * every moving part, so nothing lands out of step.
 *
 * Two things the reference does NOT have, added for this site:
 *   - an optional leading icon (the macOS build gets an Apple mark)
 *   - `prefers-reduced-motion`, which removes the motion entirely
 *
 * The label is a <span>, not an <i>: an <i> would be italicised by the user
 * agent stylesheet, which is exactly what the first version of this got wrong.
 *
 * No dependencies. ES module.
 */

export const DEFAULTS = {
  label: 'Click to Copy',
  variant: 'one', // 'one' = red crosses + ruled box, 'two' = brackets, no rules
  href: null, // renders an <a> when set
  icon: null, // optional SVG markup, drawn before the label
  iconSize: 16, // px
  iconGap: 10, // px between the icon and the label
  textColor: '#ffffff',
  accentColor: '#ff0000', // the corner strokes and the scan
  lineColor: '#ffffff', // the box rules, drawn at opacity .1
  fontSize: 16, // px; the box height follows from it (24 + 1.2em + 24)
  fontFamily: 'Inter, Inter Placeholder, sans-serif',
  padding: '24px 30px',
  cornerSize: 11, // px, the corner mark
  markOffset: 5, // px the mark sits outside the box corner
  duration: 0.4, // s, shared by every moving part
  ease: 'cubic-bezier(0.22, 1, 0.36, 1)',
};

const CSS = `
.qsb {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  gap: 30px;
  align-items: flex-start;
  justify-content: center;
  width: min-content;
  cursor: pointer;
  text-decoration: none;
  overflow: visible;
  -webkit-font-smoothing: antialiased;
  -webkit-tap-highlight-color: transparent;
  /* The module renders a <button> when no href is given, and a <button> carries
     the UA's own background, border and padding. Without this reset that shows
     as a grey slab behind the box — invisible on the site, which passes an href
     and so gets an <a>, but wrong for every other caller. */
  appearance: none;
  -webkit-appearance: none;
  background: none;
  border: 0;
  margin: 0;
  padding: 0;
  font: inherit;
  color: inherit;
  text-align: inherit;
}

/* --- the corner marks ------------------------------------------------ */

/* An 11px square centred on each corner of the box. Two 1px strokes cross
   inside it: at rest they sit on the mark's outer edges so the mark reads as a
   "+" straddling the corner, and on hover they slide to the mark's centre. */
.qsb-mark {
  position: absolute;
  width: var(--qsb-corner);
  height: var(--qsb-corner);
  aspect-ratio: 1;
  z-index: 2;
  overflow: clip;
}
.qsb-mark > i {
  position: absolute;
  display: block;
  background: var(--qsb-accent);
}
/* The strokes sit at the mark's centre, so they cross on the box corner and the
   mark reads as a "+". The reference's measured rest state puts the vertical
   stroke at the button's left edge — which is the mark's own centre, not its
   edge. Putting them on the edge instead gives a bracket that opens away from
   the box, which is not the design. */
.qsb-mark > .v {
  top: 0;
  bottom: 0;
  width: 1px;
  left: calc(50% - 0.5px);
}
.qsb-mark > .h {
  left: 0;
  right: 0;
  height: 1px;
  top: calc(50% - 0.5px);
}

.qsb .qsb-mark { top: calc(-1 * var(--qsb-off)); left: calc(-1 * var(--qsb-off)); }
.qsb .qsb-mark.tr { left: auto; right: calc(-1 * var(--qsb-off)); }
.qsb .qsb-mark.bl { top: auto; bottom: calc(-1 * var(--qsb-off)); }
.qsb .qsb-mark.br { top: auto; bottom: calc(-1 * var(--qsb-off)); left: auto; right: calc(-1 * var(--qsb-off)); }

/* Variant two: the marks sit inside the corner and the strokes hug the mark's
   outer edges, so each one reads as a bracket, and the box carries no rules. */
.qsb[data-two] .qsb-mark { top: 0; left: 0; }
.qsb[data-two] .qsb-mark.tr { left: auto; right: 0; }
.qsb[data-two] .qsb-mark.bl { top: auto; bottom: 0; }
.qsb[data-two] .qsb-mark.br { top: auto; bottom: 0; left: auto; right: 0; }
.qsb[data-two] .qsb-mark > .v { left: 0; }
.qsb[data-two] .qsb-mark > .h { top: 0; }
.qsb[data-two] .qsb-box > .rule { display: none; }

/* --- the box --------------------------------------------------------- */

.qsb-box {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--qsb-gap);
  width: min-content;
  padding: var(--qsb-pad);
  overflow: clip;
}
.qsb-box > .rule {
  position: absolute;
  z-index: 1;
  background: var(--qsb-line);
  opacity: 0.1;
}
.qsb-box > .top { top: 0; left: 0; right: 0; height: 1px; }
.qsb-box > .bottom { bottom: 0; left: 0; right: 0; height: 1px; }
.qsb-box > .left { top: 0; bottom: 0; left: 0; width: 1px; }
.qsb-box > .right { top: 0; bottom: 0; right: 0; width: 1px; }

/* --- the optional leading icon --------------------------------------- */

.qsb-icon {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--qsb-text);
  z-index: 2;
}
.qsb-icon svg {
  display: block;
  width: var(--qsb-icon);
  height: var(--qsb-icon);
  fill: currentColor;
}

/* --- the text well --------------------------------------------------- */

/* 19px tall and clipped, holding two stacked copies of the label. At rest the
   first is showing; on hover the pair slides up one line. Sliding is what makes
   it smooth — the reference does this with a transform, not justify-content,
   and a justify-content flip cannot animate at all. */
.qsb-well {
  position: relative;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  width: min-content;
  height: 19px;
  overflow: clip;
}
.qsb-label {
  flex: none;
  display: block;
  white-space: pre;
  font-family: var(--qsb-font);
  font-size: var(--qsb-size);
  font-weight: 500;
  font-style: normal;
  line-height: 1.2;
  color: var(--qsb-text);
  transition: transform var(--qsb-dur) var(--qsb-ease);
}
.qsb:hover .qsb-well > .qsb-label { transform: translateY(-100%); }

/* --- the scan rule --------------------------------------------------- */

.qsb-scan {
  position: absolute;
  z-index: 1;
  left: 0;
  right: 0;
  bottom: -2px;
  width: 100%;
  height: 1px;
  background: var(--qsb-accent);
  opacity: 0.1;
  transition: top var(--qsb-dur) var(--qsb-ease), bottom var(--qsb-dur) var(--qsb-ease),
    height var(--qsb-dur) var(--qsb-ease), width var(--qsb-dur) var(--qsb-ease),
    left var(--qsb-dur) var(--qsb-ease), opacity var(--qsb-dur) var(--qsb-ease);
}

/* Variant one: the rule climbs from the foot of the box and floods it. */
.qsb:hover .qsb-scan {
  top: 0;
  bottom: auto;
  height: 100%;
  opacity: 1;
}

/* Variant two: it lifts clear of the label and becomes a short bar. */
.qsb[data-two]:hover .qsb-scan {
  top: auto;
  bottom: 70px;
  height: 30px;
  left: -6.6879%;
  width: 114%;
  opacity: 0.4;
}

@media (prefers-reduced-motion: reduce) {
  .qsb-mark > i,
  .qsb-label,
  .qsb-scan { transition: none; }
}
`;

const MARKS = ['tl', 'tr', 'bl', 'br'];

function ensureStyles() {
  if (document.getElementById('qsb-style')) return;
  const style = document.createElement('style');
  style.id = 'qsb-style';
  style.textContent = CSS;
  document.head.appendChild(style);
}

function buildMark(position) {
  const mark = document.createElement('div');
  mark.className = `qsb-mark ${position}`;
  const v = document.createElement('i');
  v.className = 'v';
  const h = document.createElement('i');
  h.className = 'h';
  mark.append(v, h);
  return mark;
}

/**
 * Mount the button.
 *
 * options: any field from DEFAULTS.
 * Returns { element, settings, setLabel, setIcon, destroy }.
 */
export function createScanButton(options = {}) {
  ensureStyles();
  const s = { ...DEFAULTS, ...(options || {}) };

  const element = document.createElement(s.href ? 'a' : 'button');
  if (s.href) {
    element.href = s.href;
    element.target = '_blank';
    element.rel = 'noreferrer';
  } else {
    element.type = 'button';
  }
  element.className = 'qsb';
  if (s.variant === 'two') element.setAttribute('data-two', '');

  for (const position of MARKS) element.appendChild(buildMark(position));

  const box = document.createElement('div');
  box.className = 'qsb-box';
  for (const name of ['top', 'bottom', 'left', 'right']) {
    const rule = document.createElement('div');
    rule.className = `rule ${name}`;
    box.appendChild(rule);
  }

  let iconEl = null;
  if (s.icon) {
    iconEl = document.createElement('span');
    iconEl.className = 'qsb-icon';
    iconEl.setAttribute('aria-hidden', 'true');
    iconEl.innerHTML = s.icon;
    box.appendChild(iconEl);
  }

  const well = document.createElement('div');
  well.className = 'qsb-well';

  const rest = document.createElement('span');
  rest.className = 'qsb-label';
  rest.textContent = s.label;

  const copy = document.createElement('span');
  copy.className = 'qsb-label';
  copy.textContent = s.label;

  well.append(rest, copy);
  box.appendChild(well);

  const scan = document.createElement('div');
  scan.className = 'qsb-scan';
  box.appendChild(scan);

  element.appendChild(box);

  const apply = () => {
    element.style.setProperty('--qsb-text', s.textColor);
    element.style.setProperty('--qsb-accent', s.accentColor);
    element.style.setProperty('--qsb-line', s.lineColor);
    element.style.setProperty('--qsb-font', s.fontFamily);
    element.style.setProperty('--qsb-size', `${s.fontSize}px`);
    element.style.setProperty('--qsb-corner', `${s.cornerSize}px`);
    element.style.setProperty('--qsb-off', `${s.markOffset}px`);
    element.style.setProperty('--qsb-pad', s.padding);
    element.style.setProperty('--qsb-icon', `${s.iconSize}px`);
    element.style.setProperty('--qsb-gap', s.icon ? `${s.iconGap}px` : '30px');
    element.style.setProperty('--qsb-dur', `${s.duration}s`);
    element.style.setProperty('--qsb-ease', s.ease);
  };
  apply();

  return {
    element,
    settings: s,
    setLabel(text) {
      s.label = text;
      rest.textContent = text;
      copy.textContent = text;
    },
    setIcon(svg) {
      s.icon = svg;
      if (!iconEl) {
        iconEl = document.createElement('span');
        iconEl.className = 'qsb-icon';
        iconEl.setAttribute('aria-hidden', 'true');
        box.insertBefore(iconEl, well);
      }
      iconEl.innerHTML = svg || '';
      apply();
    },
    destroy() {
      element.remove();
    },
  };
}

export default createScanButton;
