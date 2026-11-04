// 詳細画面の読み取り。画面の目印から位置を割り出し、文字はTesseract.jsで読む。
// 画像は端末の外へ出さない。位置は画面の横幅(W)を基準にした割合で持つ
'use strict';

const Reader = (() => {
  const base = new URL('../', document.currentScript.src);

  const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

  function getPixels(img) {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    const W = c.width, H = c.height;
    const px = (x, y) => { const i = (Math.round(y) * W + Math.round(x)) * 4; return [data[i], data[i + 1], data[i + 2]]; };
    return { c, W, H, px };
  }

  // ---------- 画面の目印を探す ----------
  const isBandGreen = ([r, g, b]) => r < 90 && g > 180 && b < 150;     // 見出しの濃い緑
  const isCardRed = ([r, g, b]) => r > 225 && g > 80 && g < 150 && b > 50 && b < 130; // 上の名札の左端
  const isFrameOrange = ([r, g, b]) => r > 215 && g > 150 && b < 150;  // メインスキルの枠
  const isTextGreen = ([r, g, b]) => g > r + 30 && g > b + 30;         // 「Lv.」の文字

  // 緑の見出し帯(メインスキル・サブスキル、詳細ステータス)
  function greenBands(P) {
    const { W, H } = P, bands = [];
    for (let y = 0; y < H; y++) {
      let n = 0, total = 0;
      for (let x = W * 0.12; x < W * 0.85; x += 6) { total++; if (isBandGreen(P.px(x, y))) n++; }
      if (n > total * 0.55) {
        const last = bands[bands.length - 1];
        if (last && y - last.b <= 2) last.b = y; else bands.push({ a: y, b: y });
      }
    }
    return bands.filter((b) => b.b - b.a >= W * 0.03);
  }

  function locate(P) {
    const { W, H } = P;
    const bands = greenBands(P);
    if (bands.length < 2) return null;
    const [skill, status] = bands;

    let card = null;
    for (let y = 0; y < H * 0.3; y++) {
      if (isCardRed(P.px(W * 0.015, y))) { if (card) card.b = y; else card = { a: y, b: y }; }
    }
    if (!card) return null;

    // メインスキルの枠の下端。サブスキルの枠と違い、画面の中央まで続く
    let frameBottom = null;
    for (let y = skill.b; y < status.a; y++) if (isFrameOrange(P.px(W * 0.5, y))) frameBottom = y;
    if (frameBottom === null) return null;

    return { skill, status, card, frameBottom };
  }

  // ---------- 切り出し ----------
  // 背景との差を濃さにして、黒い文字と白い背景の画像にする。薄く表示された解放前の文字も読めるようにする
  function cropText(P, x0, y0, x1, y1, targetH = 72) {
    x0 = Math.max(0, Math.round(x0)); y0 = Math.max(0, Math.round(y0));
    x1 = Math.min(P.W, Math.round(x1)); y1 = Math.min(P.H, Math.round(y1));
    const w = x1 - x0, h = y1 - y0, scale = targetH / h;
    const c = document.createElement('canvas');
    c.width = Math.round(w * scale); c.height = targetH;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(P.c, x0, y0, w, h, 0, 0, c.width, c.height);
    const im = ctx.getImageData(0, 0, c.width, c.height), d = im.data;
    const lum = new Float32Array(d.length / 4);
    for (let i = 0; i < lum.length; i++) lum[i] = luma(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
    const sorted = Array.from(lum).sort((a, b) => a - b);
    const bg = sorted[Math.floor(sorted.length * 0.7)];
    const ink = sorted[Math.floor(sorted.length * 0.01)];
    const range = Math.max(20, bg - ink);
    for (let i = 0; i < lum.length; i++) {
      const v = Math.max(0, Math.min(255, 255 * (1 - (bg - lum[i]) / range * 1.3)));
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
    }
    ctx.putImageData(im, 0, 0);
    // 余白があるほうが認識が安定する
    const out = document.createElement('canvas');
    out.width = c.width + 40; out.height = c.height + 24;
    const o = out.getContext('2d');
    o.fillStyle = '#fff'; o.fillRect(0, 0, out.width, out.height);
    o.drawImage(c, 20, 12);
    return out;
  }

  // サブスキルの背景色(白=銀、青、黄=金)。解放前は薄いが色味は残る
  function buttonColor(P, x, y) {
    const [r, , b] = P.px(x, y);
    if (r - b > 12) return 'gold';
    if (b - r > 6) return 'blue';
    return 'white';
  }

  // 食材枠の絵の比較。背景からの差の向きを比べるので、解放前の薄い絵と通常の絵でも比べられる
  function similarity(P, cx1, cx2, y0, y1) {
    const W = P.W, bgOf = (cx) => P.px(cx - W * 0.062, y0 + (y1 - y0) / 2);
    const b1 = bgOf(cx1), b2 = bgOf(cx2);
    let dot = 0, n1 = 0, n2 = 0;
    for (let y = y0; y < y1; y += 2) {
      for (let dx = -W * 0.05; dx < W * 0.03; dx += 2) {
        const p = P.px(cx1 + dx, y), q = P.px(cx2 + dx, y);
        for (let k = 0; k < 3; k++) {
          const u = p[k] - b1[k], v = q[k] - b2[k];
          dot += u * v; n1 += u * u; n2 += v * v;
        }
      }
    }
    return n1 && n2 ? dot / Math.sqrt(n1 * n2) : null;
  }

  // ---------- 文字認識 ----------
  let workers = null;
  function loadScript(src) {
    return new Promise((ok, ng) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => ng(new Error('読み込み失敗')); document.head.append(s); });
  }
  function getWorkers() {
    workers ??= (async () => {
      if (!window.Tesseract) await loadScript(new URL('vendor/tesseract.min.js', base).href);
      const at = (p) => new URL(p, base).href;
      const opt = { workerPath: at('vendor/worker.min.js'), corePath: at('vendor/core'), langPath: at('vendor/lang'), workerBlobURL: false };
      const digits = await Tesseract.createWorker('eng', 1, opt);
      await digits.setParameters({ tessedit_char_whitelist: 'x0123456789', tessedit_pageseg_mode: '7' });
      const jpn = await Tesseract.createWorker('jpn', 1, opt);
      await jpn.setParameters({ tessedit_pageseg_mode: '7' });
      return { digits, jpn };
    })();
    workers.catch(() => { workers = null; });
    return workers;
  }
  const ocr = async (worker, canvas) => (await worker.recognize(canvas)).data.text.replace(/\s/g, '');

  // 枠の右下の「x7」の数字を読む。細い「1」は大きさを変えると読めることがある
  async function readAmount(P, digits, x, y, halfH = 0.013) {
    const W = P.W;
    for (const [dx, h] of [[0.026, 60], [0.022, 96], [0.03, 44]]) {
      const t = await ocr(digits, cropText(P, x - W * dx, y - W * halfH, x + W * dx, y + W * halfH, h));
      const m = t.match(/(\d{1,2})$/);
      if (m) return Number(m[1]);
    }
    return null;
  }

  function iconOf(P, card) {
    const { W } = P, h = card.b - card.a;
    const c = document.createElement('canvas');
    c.width = c.height = 120;
    c.getContext('2d').drawImage(P.c, W * 0.055, card.a + h * 0.08, W * 0.14, W * 0.14, 0, 0, 120, 120);
    return c.toDataURL('image/png');
  }

  async function analyze(img) {
    const P = getPixels(img), { W } = P;
    const loc = locate(P);
    if (!loc) throw new Error('詳細画面の目印が見つかりません');
    const { digits, jpn } = await getWorkers();
    const { card, skill, status, frameBottom } = loc;
    const res = { sub: [], subColor: [], clues: {}, warnings: [], icon: iconOf(P, card) };

    // 名前: 名札の下段で、緑の「Lv.xx」より右
    const h = card.b - card.a;
    const ny0 = card.a + h * 0.56, ny1 = card.a + h * 0.86;
    let nx = W * 0.2;
    for (let x = W * 0.2; x < W * 0.36; x++) {
      for (let y = ny0; y < ny1; y += 2) if (isTextGreen(P.px(x, y))) { nx = x; break; }
    }
    res.name = await ocr(jpn, cropText(P, nx + W * 0.008, ny0, W * 0.56, ny1));

    // メインスキルのレベル: 枠の右上の「Lv.1」の数字だけを読む。見出しの下端からの距離は一定
    res.skillLevel = await readAmount(P, digits, W * 0.893, skill.b + W * 0.1277, 0.018);
    if (res.skillLevel === null) res.warnings.push('スキルレベルを読めませんでした');

    // サブスキル: 2列3段。メインスキルの枠の下端からの距離は説明文の行数によらない
    for (let i = 0; i < 5; i++) {
      const top = frameBottom + W * 0.0714 + Math.floor(i / 2) * W * 0.1575;
      const left = i % 2 === 0 ? W * 0.085 : W * 0.54;
      const cy = top + W * 0.045;
      res.subColor.push(buttonColor(P, left + W * 0.012, cy));
      res.sub.push(await ocr(jpn, cropText(P, left, cy - W * 0.024, left + W * 0.375, cy + W * 0.024)));
    }

    // 性格: 詳細ステータスの見出しからの距離が一定
    const ny = status.a + W * 0.187;
    res.nature = await ocr(jpn, cropText(P, W * 0.1, ny - W * 0.025, W * 0.46, ny + W * 0.025));

    // 食材: 文字がないので、個数と隣の枠との比較を手がかりとして返す(種族が決まってから判定する)
    const badgeY = skill.a - W * 0.3725;
    const badge = [0.541, 0.709, 0.873].map((f) => f * W);
    const icon = [0.4946, 0.660, 0.825].map((f) => f * W);
    const amount = [];
    for (const x of badge.slice(1)) {
      amount.push(await readAmount(P, digits, x, badgeY));
    }
    const iy = badgeY - W * 0.056;
    const stripTop = Math.max(card.b + W * 0.008, iy - W * 0.04);
    const stripBottom = iy + W * 0.05;
    const visible = stripBottom - stripTop > W * 0.012;
    res.clues = {
      amount,
      s21: visible ? similarity(P, icon[0], icon[1], stripTop, stripBottom) : null,
      s31: visible ? similarity(P, icon[0], icon[2], stripTop, stripBottom) : null,
      s32: similarity(P, icon[1], icon[2], iy - W * 0.04, stripBottom),
    };
    return res;
  }

  async function read(file) {
    const url = URL.createObjectURL(file);
    try {
      // img.decode() はタブが裏にあると止まることがあるので onload で待つ
      const img = await new Promise((ok, ng) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ng(new Error('画像を開けませんでした')); im.src = url; });
      return await analyze(img);
    } finally { URL.revokeObjectURL(url); }
  }

  return { read, analyze, locate, getPixels };
})();
