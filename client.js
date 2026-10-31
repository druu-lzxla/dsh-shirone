// dsh-lingo-pet —— 浏览器半边（设置 → 外语桌宠）

window.__ModuleLoader__.load({
  id: 'dsh-lingo-pet',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect } = React

    const API = '/dsh-lingo-pet'

    const CSS = [
      '.lp-set{display:flex;flex-direction:column;gap:14px;font-size:13px;line-height:1.6}',
      '.lp-set h3{margin:0;font-size:14px}',
      '.lp-set .lp-row{display:flex;align-items:center;gap:10px}',
      '.lp-set .lp-row label{flex:none;width:118px;color:#8b8f96}',
      '.lp-set input[type=number]{width:84px;padding:4px 6px;border-radius:6px;',
      'border:1px solid rgba(128,128,128,.35);background:transparent;color:inherit}',
      '.lp-set select{padding:4px 6px;border-radius:6px;border:1px solid rgba(128,128,128,.35);',
      'background:transparent;color:inherit}',
      '.lp-set .lp-hint{color:#8b8f96;font-size:12px}',
      '.lp-set .lp-btns{display:flex;gap:8px;flex-wrap:wrap}',
      '.lp-set button{padding:5px 12px;border-radius:6px;border:1px solid rgba(128,128,128,.4);',
      'background:transparent;color:inherit;cursor:pointer;font:inherit}',
      '.lp-set button:hover{background:rgba(128,128,128,.12)}',
      '.lp-set .lp-msg{color:#e0a04a;font-size:12px;min-height:16px}',
      '.lp-set .lp-stat{color:#8b8f96;font-size:12px}',
    ].join('')

    function num(v, d) {
      const n = Number(v)
      return Number.isFinite(n) ? n : d
    }

    function Panel() {
      const [cfg, setCfg] = useState(null)
      const [stats, setStats] = useState(null)
      const [msg, setMsg] = useState('')

      const load = () => {
        fetch(API + '/config', { cache: 'no-store' })
          .then((r) => r.json())
          .then((d) => {
            if (d && d.cfg) {
              setCfg(d.cfg)
              setStats(d.stats)
            }
          })
          .catch(() => setMsg('读不到配置（宿主那半边没起来？）'))
      }

      useEffect(() => { load() }, [])

      if (!cfg) return h('div', { className: 'lp-set' }, h('div', { className: 'lp-hint' }, '加载中…'))

      const set = (k, v) => setCfg({ ...cfg, [k]: v })

      const save = () => {
        fetch(API + '/config', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(cfg),
        })
          .then((r) => r.json())
          .then((d) => {
            if (d && d.cfg) {
              setCfg(d.cfg)
              setStats(d.stats)
            }
            setMsg('已保存')
            setTimeout(() => setMsg(''), 2000)
          })
          .catch(() => setMsg('保存失败'))
      }

      const pause = (minutes, resume) => {
        fetch(API + '/pause', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(resume ? { resume: true } : { minutes }),
        })
          .then((r) => r.json())
          .then((d) => {
            if (d && d.pausedUntil !== undefined) {
              setStats({ ...stats, pausedUntil: d.pausedUntil })
            }
            setMsg(resume ? '已恢复' : `静音 ${minutes} 分钟`)
            setTimeout(() => setMsg(''), 2000)
          })
          .catch(() => setMsg('操作失败'))
      }

      const preview = () => {
        fetch(API + '/preview', { method: 'POST' })
          .then((r) => r.json())
          .then((d) => {
            setMsg(d && d.ok ? '已经让它说了一句，看右下角' : '没有可用的句子（语料读不到？）')
            setTimeout(() => setMsg(''), 3000)
          })
          .catch(() => setMsg('试一句失败'))
      }

      const paused = (stats && stats.pausedUntil > Date.now()) || false
      const untilMidnight = Math.max(1, Math.round((new Date().setHours(24, 0, 0, 0) - Date.now()) / 60000))

      return h('div', { className: 'lp-set' },
        h('h3', null, '外语桌宠'),
        h('div', { className: 'lp-hint' }, '一只住在页面里、说日语的小东西。它不说话的时候，就是不在。'),

        h('div', { className: 'lp-row' },
          h('label', null, '启用'),
          h('input', { type: 'checkbox', checked: cfg.enabled, onChange: (e) => set('enabled', e.target.checked) }),
          h('span', { className: 'lp-hint' }, '关掉之后完全安静（设置页还在）')),

        h('div', { className: 'lp-row' },
          h('label', null, '每日句数'),
          h('input', { type: 'number', min: 4, max: 30, value: cfg.budget, onChange: (e) => set('budget', num(e.target.value, 12)) }),
          h('span', { className: 'lp-hint' }, '4–30。按活跃时段自动摊平，不会上午说完下午装死')),

        h('div', { className: 'lp-row' },
          h('label', null, '活跃时段'),
          h('input', { type: 'number', min: 0, max: 23, value: cfg.activeStart, onChange: (e) => set('activeStart', num(e.target.value, 9)) }),
          h('span', null, '点 —'),
          h('input', { type: 'number', min: 0, max: 24, value: cfg.activeEnd, onChange: (e) => set('activeEnd', num(e.target.value, 23)) }),
          h('span', null, '点')),

        h('div', { className: 'lp-row' },
          h('label', null, '安静时段'),
          h('input', { type: 'number', min: 0, max: 23, value: cfg.quietStart, onChange: (e) => set('quietStart', num(e.target.value, 23)) }),
          h('span', null, '点 —'),
          h('input', { type: 'number', min: 0, max: 24, value: cfg.quietEnd, onChange: (e) => set('quietEnd', num(e.target.value, 8)) }),
          h('span', null, '点')),

        h('div', { className: 'lp-row' },
          h('label', null, '最小间隔'),
          h('input', { type: 'number', min: 1, max: 120, value: cfg.minGapMin, onChange: (e) => set('minGapMin', num(e.target.value, 6)) }),
          h('span', null, '分钟')),

        h('div', { className: 'lp-row' },
          h('label', null, '译文'),
          h('select', { value: cfg.showGloss, onChange: (e) => set('showGloss', e.target.value) },
            h('option', { value: 'hover' }, '悬停显示'),
            h('option', { value: 'always' }, '一直显示'),
            h('option', { value: 'off' }, '不显示')),
          h('span', { className: 'lp-hint' }, '点词查义永远可用')),

        h('div', { className: 'lp-row' },
          h('label', null, '语音'),
          h('input', { type: 'checkbox', checked: cfg.voice, onChange: (e) => set('voice', e.target.checked) }),
          h('span', { className: 'lp-hint' }, '用系统日语语音朗读（Windows 上效果一般）')),

        h('div', { className: 'lp-row' },
          h('label', null, '等级'),
          h('select', { value: cfg.level, onChange: (e) => set('level', e.target.value) },
            h('option', { value: 'A2' }, 'A2'),
            h('option', { value: 'B1' }, 'B1'),
            h('option', { value: 'B2' }, 'B2')),
          h('span', { className: 'lp-hint' }, '语料目前只有 A2')),

        h('div', { className: 'lp-stat' },
          stats
            ? `今天已说 ${stats.used} 句（预算 ${stats.budget}）｜词账本 ${stats.words} 个｜语料 ${stats.corpus} 句`
            : ''),
        paused ? h('div', { className: 'lp-hint' }, '当前静音中：' + new Date(stats.pausedUntil).toLocaleTimeString()) : null,

        h('div', { className: 'lp-btns' },
          h('button', { onClick: preview }, '试一句'),
          h('button', { onClick: save }, '保存设置'),
          h('button', { onClick: () => pause(60) }, '静音 1 小时'),
          h('button', { onClick: () => pause(untilMidnight) }, '静音今天'),
          h('button', { onClick: () => pause(0, true) }, '恢复')),

        h('div', { className: 'lp-msg' }, msg),
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const style = document.createElement('style')
        style.setAttribute('data-plugin-css', 'dsh-lingo-pet')
        style.textContent = CSS
        document.head.appendChild(style)
        ctx.effect(() => () => style.remove())

        const slots = (typeof ctx.get === 'function' ? ctx.get('slots') : undefined) || ctx.slots
        if (!slots) return
        slots.inject('settings.section', () => slots.register(
          { name: 'settings.section', id: 'lingo-pet', order: 56, label: '外语桌宠' },
          () => h(Panel),
        ))
      },
    }
  },
})
