/* theme.js — ナビ挿入・テーマ管理・トースト・loading・コピー・サイドパネル・デザインテーマ（ライト／ダーク両対応） */

(function(){
  // ===== ナビゲーションのロード =====
  async function loadNav(){
    try{
      const res = await fetch('assets/nav.html');
      const html = await res.text();
      document.body.insertAdjacentHTML('afterbegin', html);
      attachThemeToggle();
      markActiveLink();
      attachSidePanelButton();
    }catch(e){
      console.warn('nav load failed', e);
      const fallback = `
        <nav class="site-nav">
          <a class="brand" href="index.html">Study Board</a>
          <div class="links">
            <a href="index.html">投稿一覧</a>
            <a href="ranking.html">ランキング</a>
            <a href="profile.html">プロフィール</a>
            <button id="theme-toggle" class="icon-btn">🌗</button>
          </div>
        </nav>`;
      document.body.insertAdjacentHTML('afterbegin', fallback);
      attachThemeToggle();
      markActiveLink();
      attachSidePanelButton();
    }
  }

  function markActiveLink(){
    const page = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('nav.site-nav .links a').forEach(a=>{
      if(a.getAttribute('href') === page || (a.getAttribute('href') === 'index.html' && page === ''))
        a.classList.add('active');
    });
  }

  // ===== テーマ切替（ライト／ダーク） =====
  function attachThemeToggle(){
    const btn = document.getElementById('theme-toggle');
    if(!btn) return;

    const savedMode = localStorage.getItem('mode') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark':'light');
    document.documentElement.setAttribute('data-mode', savedMode);
    updateThemeIcon();

    btn.addEventListener('click', ()=>{
      const cur = document.documentElement.getAttribute('data-mode') === 'dark' ? 'dark':'light';
      const next = cur==='dark' ? 'light':'dark';
      document.documentElement.setAttribute('data-mode', next);
      localStorage.setItem('mode', next);
      applyCurrentTheme();
      updateThemeIcon();
    });
  }

  function updateThemeIcon(){
    const btn = document.getElementById('theme-toggle');
    if(!btn) return;
    btn.textContent = document.documentElement.getAttribute('data-mode')==='dark' ? '☀️' : '🌙';
  }

  // ===== トースト・ローディング・コピー =====
  window.showToast = function(msg, ms=1600){
    let t = document.getElementById('toast');
    if(!t){ t = document.createElement('div'); t.id='toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(()=> t.classList.remove('show'), ms);
  };

  window.showLoading = function(on=true){
    let o = document.getElementById('loading-overlay');
    if(!o){
      o = document.createElement('div');
      o.id = 'loading-overlay';
      o.className = 'modal-overlay';
      o.innerHTML = `<div class="modal card"><div style="font-weight:700">読み込み中…</div></div>`;
      document.body.appendChild(o);
    }
    o.style.display = on ? 'flex' : 'none';
  };

  window.copyToClipboard = async function(text){
    try{ await navigator.clipboard.writeText(text); showToast('リンクをコピーしました！'); }
    catch(e){ showToast('コピーに失敗しました'); }
  };

  // ===== サイドパネル =====
  function attachSidePanelButton(){
    const themeBtn = document.getElementById('theme-toggle');
    if(!themeBtn || document.getElementById('side-panel-toggle')) return;

    const menuBtn = document.createElement('button');
    menuBtn.id = 'side-panel-toggle';
    menuBtn.className = 'icon-btn';
    menuBtn.title = 'メニュー';
    menuBtn.textContent = '⋮';
    Object.assign(menuBtn.style, {
      fontSize: '1.4rem',
      marginLeft: '8px',
      background: 'transparent',
      border: 'none',
      cursor: 'pointer',
      color: 'var(--text)',
      transition: 'opacity 0.2s'
    });
    menuBtn.addEventListener('mouseenter', ()=> menuBtn.style.opacity = '0.7');
    menuBtn.addEventListener('mouseleave', ()=> menuBtn.style.opacity = '1.0');

    themeBtn.insertAdjacentElement('afterend', menuBtn);
    menuBtn.addEventListener('click', openSidePanel);
  }

  function openSidePanel(){
    let overlay = document.getElementById('side-overlay');
    let panel = document.getElementById('side-panel');

    if(!overlay){
      overlay = document.createElement('div');
      overlay.id = 'side-overlay';
      Object.assign(overlay.style, {
        position: 'fixed', top:0,left:0,width:'100%',height:'100%',
        background:'rgba(0,0,0,0.4)', backdropFilter:'blur(2px)',
        zIndex:2500, opacity:0, transition:'opacity 0.3s ease'
      });
      document.body.appendChild(overlay);
      overlay.addEventListener('click', closeSidePanel);
      setTimeout(()=> overlay.style.opacity='1',10);
    }

    if(!panel){
      panel = document.createElement('div');
      panel.id = 'side-panel';
      Object.assign(panel.style,{
        position:'fixed', top:0, right:'-320px', width:'280px', height:'100%',
        background:'var(--card)', boxShadow:'-4px 0 20px rgba(0,0,0,0.2)',
        transition:'right 0.3s ease', zIndex:2600,
        padding:'24px 20px', borderRadius:'12px 0 0 12px',
        display:'flex', flexDirection:'column', gap:'14px'
      });

      panel.innerHTML = `
        <h3 style="margin:0 0 16px 0;font-weight:700;font-size:1.1rem;">メニュー</h3>
        <button class="menu-btn" data-link="dm.html">📨 DMページへ</button>
        <button class="menu-btn" data-link="friends.html">👥 友達ページへ</button>
        <button class="menu-btn" data-link="notifications.html">🔔 通知ページへ</button>
        <hr style="margin:8px 0;border:none;border-top:1px solid var(--border);">
        <button class="menu-btn" id="open-theme-panel">🎨 デザイン</button>
      `;
      document.body.appendChild(panel);

      panel.querySelectorAll('.menu-btn[data-link]').forEach(btn=>{
        Object.assign(btn.style, baseBtnStyle());
        btn.addEventListener('mouseenter', ()=> btn.style.transform='scale(1.03)');
        btn.addEventListener('mouseleave', ()=> btn.style.transform='scale(1)');
        btn.addEventListener('click', ()=> location.href=btn.dataset.link);
      });

      const designBtn = panel.querySelector('#open-theme-panel');
      Object.assign(designBtn.style, baseBtnStyle());
      designBtn.addEventListener('click', ()=>{
        closeSidePanel();
        openThemePanel();
      });
    }

    requestAnimationFrame(()=> panel.style.right='0');
  }

  function baseBtnStyle(){
    return {
      width:'100%', padding:'12px', borderRadius:'10px', background:'var(--accent)',
      color:'#fff', fontWeight:'600', border:'none', cursor:'pointer',
      fontSize:'0.95rem', transition:'background 0.2s, transform 0.2s'
    };
  }

  function closeSidePanel(){
    const overlay=document.getElementById('side-overlay');
    const panel=document.getElementById('side-panel');
    if(panel) panel.style.right='-320px';
    if(overlay){ overlay.style.opacity='0'; setTimeout(()=> overlay.remove(),300); }
  }

  document.addEventListener('DOMContentLoaded', loadNav);
})();

// ===== デザインテーマ管理（ライト／ダーク対応） =====
document.addEventListener('DOMContentLoaded', ()=>{

  const themes = {
    normal: { name:'ノーマル', light:{accent:'#4caf50',bg:'#f6faf7',card:'#fff',text:'#0f1724'}, dark:{accent:'#4caf50',bg:'#1f1f1f',card:'#2a2a2a',text:'#e0f0d9'} },
    blue:   { name:'青空', light:{accent:'#2196f3',bg:'#e8f4fd',card:'#fff',text:'#0d1b2a'}, dark:{accent:'#2196f3',bg:'#0b1c2c',card:'#112233',text:'#cfe8ff'} },
    yellow: { name:'ひだまり', light:{accent:'#ffb300',bg:'#fff9e6',card:'#fffef9',text:'#3e2723'}, dark:{accent:'#ffb300',bg:'#3a2c0b',card:'#554400',text:'#ffea88'} },
    night:  { name:'ミッドナイト', light:{accent:'#3949ab',bg:'#e0e0ff',card:'#ffffff',text:'#0d0d33'}, dark:{accent:'#3949ab',bg:'#0d1117',card:'#1c1f26',text:'#f0f4ff'} },
    sakura: { name:'さくら', light:{accent:'#f48fb1',bg:'#fff0f5',card:'#fff',text:'#4a2c2a'}, dark:{accent:'#f48fb1',bg:'#2a0d1a',card:'#3d1524',text:'#ffcce6'} },
    neo:    { name:'ネオ', light:{accent:'#00bcd4',bg:'#e0f7fa',card:'#ffffff',text:'#004d55'}, dark:{accent:'#00bcd4',bg:'#121212',card:'#1f1f1f',text:'#e0f7fa'} },
    green:  { name:'森', light:{accent:'#43a047',bg:'#e8f5e9',card:'#ffffff',text:'#1b3e20'}, dark:{accent:'#43a047',bg:'#0b1c0b',card:'#102210',text:'#b4ffc1'} },
    purple: { name:'紫陽花', light:{accent:'#7e57c2',bg:'#f3e5f5',card:'#ffffff',text:'#2c1a3a'}, dark:{accent:'#7e57c2',bg:'#1a0b20',card:'#291432',text:'#d3b3ff'} }
  };

  let currentTheme = localStorage.getItem('theme') || 'normal';

  // ===== テーマパネル =====
  window.openThemePanel = function(){
    if(document.getElementById('theme-panel')) return;

    const panel=document.createElement('div');
    panel.id='theme-panel';
    panel.className='modal-overlay';
    panel.innerHTML=`
      <div class="modal card" style="max-width:400px;">
        <h3 style="margin-top:0;">デザインテーマを選ぶ</h3>
        <div class="theme-options" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;"></div>
        <button id="close-theme-panel" class="btn" style="width:100%;">閉じる</button>
      </div>`;
    document.body.appendChild(panel);

    const options = panel.querySelector('.theme-options');
    for(const [key,t] of Object.entries(themes)){
      const btn = document.createElement('button');
      btn.className='theme-choice';
      Object.assign(btn.style,{
        flex:'1 1 45%',padding:'10px',borderRadius:'10px',border:'1px solid var(--border)',
        display:'flex',alignItems:'center',gap:'8px',cursor:'pointer',background:'var(--card)',
        transition:'transform 0.2s'
      });
      btn.innerHTML=`<div style="width:18px;height:18px;border-radius:50%;background:${t.light.accent}"></div><span>${t.name}</span>`;
      btn.addEventListener('mouseenter',()=>btn.style.transform='scale(1.05)');
      btn.addEventListener('mouseleave',()=>btn.style.transform='scale(1)');
      btn.addEventListener('click',()=>{
        currentTheme=key;
        localStorage.setItem('theme', key);
        applyCurrentTheme();
        showToast(`${t.name} テーマに変更しました`);
      });
      options.appendChild(btn);
    }

    panel.querySelector('#close-theme-panel').addEventListener('click',()=>panel.remove());
  };

  function applyCurrentTheme(){
    const mode = document.documentElement.getAttribute('data-mode') || 'light';
    const t = themes[currentTheme] || themes.normal;
    const colors = t[mode];

    const root = document.documentElement;
    root.style.setProperty('--accent', colors.accent);
    root.style.setProperty('--bg', colors.bg);
    root.style.setProperty('--card', colors.card);
    root.style.setProperty('--text', colors.text);
  }

  // 初回適用
  applyCurrentTheme();

  // モード変更時も反映
  const observer = new MutationObserver(()=>{ applyCurrentTheme(); });
  observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-mode']});
});
