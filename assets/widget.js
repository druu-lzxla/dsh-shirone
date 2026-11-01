// dsh-lingo-pet —— 页面里的宠物（纯 DOM，无依赖）
// 只做四件事：显示、拖、说、把交互报回宿主。

;(function () {
  'use strict'
  if (window.__lingoPetInited) return
  window.__lingoPetInited = true

  var API = '/dsh-lingo-pet'
  var pos = { x: 0.86, y: 0.82 }
  var lastAt = 0
  var showGloss = 'hover'
  var voice = false
  var pausedUntil = 0
  var hideTimer = null
  var current = null

  var css = [
    '.lp-root{position:fixed;z-index:99980;width:132px;height:132px;',
    'transform:translate(-50%,-50%);user-select:none;-webkit-user-select:none;',
    'transition:opacity .2s;touch-action:none}',
    '.lp-root img{width:100%;height:100%;display:block;pointer-events:none;',
    'filter:drop-shadow(0 0 1px rgba(0,0,0,.35)) drop-shadow(0 6px 10px rgba(0,0,0,.28))}',
    '.lp-root .lp-body{width:100%;height:100%;cursor:grab;position:relative;',
    'animation:lp-breathe 4.2s ease-in-out infinite}',
    '.lp-root.lp-drag .lp-body{cursor:grabbing}',
    '@keyframes lp-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.035)}}',
    '.lp-root.lp-talk .lp-body{animation:lp-talk .6s ease-in-out 2}',
    '@keyframes lp-talk{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}',
    '.lp-bubble{position:absolute;left:50%;bottom:calc(100% - 12px);transform:translateX(-50%);',
    'min-width:120px;max-width:260px;padding:10px 12px;border-radius:12px;',
    'background:#fffdf8;color:#242024;border:1px solid rgba(0,0,0,.08);',
    'box-shadow:0 8px 24px rgba(0,0,0,.18);font:14px/1.5 system-ui,"Yu Gothic UI","Meiryo",sans-serif;',
    'display:none;cursor:default}',
    '.lp-bubble.lp-on{display:block}',
    '.lp-bubble:after{content:"";position:absolute;left:50%;top:100%;transform:translateX(-50%);',
    'border:7px solid transparent;border-top-color:#fffdf8}',
    '.lp-text{white-space:pre-wrap;word-break:break-word}',
    '.lp-gloss{margin-top:4px;color:#8a8580;font-size:12px;display:none}',
    '.lp-bubble.lp-gloss-on .lp-gloss{display:block}',
    '.lp-w{cursor:pointer;border-bottom:1px dashed rgba(180,120,60,.55)}',
    '.lp-w:hover{background:rgba(255,196,120,.35);border-radius:3px}',
    '.lp-word{position:absolute;z-index:2;left:50%;top:-6px;transform:translate(-50%,-100%);',
    'background:#2b2a2e;color:#f3efe8;border-radius:8px;padding:6px 9px;font-size:12px;',
    'white-space:nowrap;display:none}',
    '.lp-word.lp-on{display:block}',
    '.lp-badge{position:absolute;right:-2px;top:-2px;font-size:12px;opacity:.75;display:none}',
    '.lp-root.lp-paused .lp-badge{display:block}',
    '.lp-root.lp-paused img{filter:grayscale(.5) drop-shadow(0 6px 10px rgba(0,0,0,.2))}',
  ].join('')

  var style = document.createElement('style')
  style.setAttribute('data-plugin-css', 'dsh-lingo-pet')
  style.textContent = css
  document.head.appendChild(style)

  var root = document.createElement('div')
  root.className = 'lp-root'
  root.innerHTML =
    '<div class="lp-body"><img src="' + API + '/pet.png" alt="">' +
    '<div class="lp-bubble"><div class="lp-text"></div><div class="lp-gloss"></div>' +
    '<div class="lp-word"></div></div>' +
    '<div class="lp-badge">z z</div></div>'
  document.body.appendChild(root)

  var body = root.querySelector('.lp-body')
  var bubble = root.querySelector('.lp-bubble')
  var textEl = root.querySelector('.lp-text')
  var glossEl = root.querySelector('.lp-gloss')
  var wordEl = root.querySelector('.lp-word')

  // 新图还没就位（或路由没重启）时，退回原来的占位 SVG，别显示裂图
  var petImg = root.querySelector('.lp-body img')
  petImg.addEventListener('error', function () {
    if (petImg.dataset.fallback) return
    petImg.dataset.fallback = '1'
    petImg.src = API + '/pet.svg'
  })

  function place() {
    root.style.left = pos.x * 100 + '%'
    root.style.top = pos.y * 100 + '%'
  }
  place()

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
    })
  }

  function markWords(text, words) {
    var ranges = []
    ;(words || []).forEach(function (w) {
      if (!w || !w.w) return
      var i = text.indexOf(w.w)
      if (i >= 0) ranges.push({ i: i, j: i + w.w.length, w: w })
    })
    ranges.sort(function (a, b) { return a.i - b.i || b.j - a.j })
    var picked = []
    var last = 0
    ranges.forEach(function (r) {
      if (r.i >= last) { picked.push(r); last = r.j }
    })
    var html = ''
    var p = 0
    picked.forEach(function (r) {
      html += esc(text.slice(p, r.i))
      html += '<span class="lp-w" data-w="' + esc(r.w.w) + '" data-l="' + esc(r.w.lemma || r.w.w) + '">' +
        esc(text.slice(r.i, r.j)) + '</span>'
      p = r.j
    })
    html += esc(text.slice(p))
    return html
  }

  function send(kind, extra) {
    var payload = Object.assign({ kind: kind }, extra || {})
    fetch(API + '/event', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(function () {})
  }

  function speak(text) {
    if (!voice || !window.speechSynthesis) return
    try {
      var u = new SpeechSynthesisUtterance(text)
      u.lang = 'ja-JP'
      u.rate = 0.92
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(u)
    } catch (e) { /* 没声音不影响显示 */ }
  }

  function show(line) {
    current = line
    textEl.innerHTML = markWords(line.text, line.words)
    glossEl.textContent = line.gloss || ''
    wordEl.classList.remove('lp-on')
    bubble.classList.add('lp-on')
    if (showGloss === 'always') bubble.classList.add('lp-gloss-on')
    else bubble.classList.remove('lp-gloss-on')
    root.classList.remove('lp-talk')
    void root.offsetWidth
    root.classList.add('lp-talk')
    clearTimeout(hideTimer)
    hideTimer = setTimeout(function () {
      if (!bubble.matches(':hover')) bubble.classList.remove('lp-on')
    }, 6500)
    speak(line.text)
  }

  bubble.addEventListener('mouseenter', function () {
    if (showGloss === 'hover') bubble.classList.add('lp-gloss-on')
    clearTimeout(hideTimer)
    send('hover', { id: current && current.id })
  })
  bubble.addEventListener('mouseleave', function () {
    if (showGloss === 'hover') bubble.classList.remove('lp-gloss-on')
    hideTimer = setTimeout(function () { bubble.classList.remove('lp-on') }, 2500)
  })

  bubble.addEventListener('click', function (e) {
    var span = e.target.closest ? e.target.closest('.lp-w') : null
    if (!span) return
    var w = span.getAttribute('data-w')
    var lemma = span.getAttribute('data-l')
    var word = ((current && current.words) || []).find(function (x) { return x.w === w })
    wordEl.textContent = w + (word && word.r ? '（' + word.r + '）' : '') + ' · ' + (word ? word.g : '')
    wordEl.classList.add('lp-on')
    setTimeout(function () { wordEl.classList.remove('lp-on') }, 2600)
    send('word', { w: w, lemma: lemma, id: current && current.id })
  })

  // ---- 拖拽 ----
  var drag = null
  body.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return
    drag = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y, moved: false }
    root.classList.add('lp-drag')
    body.setPointerCapture(e.pointerId)
  })
  body.addEventListener('pointermove', function (e) {
    if (!drag) return
    var dx = e.clientX - drag.x
    var dy = e.clientY - drag.y
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return
    drag.moved = true
    pos = {
      x: Math.min(0.98, Math.max(0.02, drag.px + dx / window.innerWidth)),
      y: Math.min(0.98, Math.max(0.02, drag.py + dy / window.innerHeight)),
    }
    place()
  })
  body.addEventListener('pointerup', function (e) {
    if (!drag) return
    var wasDrag = drag.moved
    drag = null
    root.classList.remove('lp-drag')
    if (wasDrag) send('pos', pos)
  })

  body.addEventListener('click', function () {
    if (current && !root.classList.contains('lp-drag')) send('click', { id: current.id })
  })

  body.addEventListener('dblclick', function () {
    var minutes = pausedUntil > Date.now() ? 0 : 240
    fetch(API + '/pause', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(minutes ? { minutes: minutes } : { resume: true }),
    }).catch(function () {})
  })

  body.addEventListener('contextmenu', function (e) {
    e.preventDefault()
    if (pausedUntil > Date.now()) return
    fetch(API + '/pause', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ minutes: 60 }),
    }).catch(function () {})
  })

  // ---- 轮询 ----
  function poll() {
    fetch(API + '/poll?after=' + lastAt, { cache: 'no-store' })
      .then(function (r) { return r.json() })
      .then(function (data) {
        if (!data) return
        showGloss = data.showGloss || 'hover'
        voice = Boolean(data.voice)
        pausedUntil = data.pausedUntil || 0
        root.classList.toggle('lp-paused', pausedUntil > Date.now())
        root.style.display = data.enabled === false ? 'none' : ''
        if (data.pos && !drag) {
          pos = data.pos
          place()
        }
        if (data.line && data.line.id) {
          lastAt = data.now
          show(data.line)
        }
      })
      .catch(function () {})
      .finally(function () {
        setTimeout(poll, 5000)
      })
  }

  setTimeout(poll, 800)

  // 在输入框里打字时告诉宿主"别说话"
  document.addEventListener('keydown', function (e) {
    var t = e.target
    if (!t) return
    var tag = (t.tagName || '').toLowerCase()
    if (tag === 'input' || tag === 'textarea' || t.isContentEditable) send('typing')
  }, true)
})()
