/* theme.js — ナビ挿入・テーマ管理・トースト・loading・コピー */
(function(){
  /* insert nav */
  async function loadNav(){
    try{
      const res = await fetch('assets/nav.html');
      const html = await res.text();
      document.body.insertAdjacentHTML('afterbegin', html);
      attachThemeToggle();
      markActiveLink();
    }catch(e){
      console.warn('nav load failed', e);
      const fallback = `<nav class="site-nav"><a class="brand" href="index.html">Study Board</a><div class="links"><a href="index.html">投稿一覧</a><a href="ranking.html">ランキング</a><a href="profile.html">プロフィール</a><button id="theme-toggle" class="icon-btn">🌗</button></div></nav>`;
      document.body.insertAdjacentHTML('afterbegin', fallback);
      attachThemeToggle();
      markActiveLink();
    }
  }

  function markActiveLink(){
    const page = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('nav.site-nav .links a').forEach(a=>{
      const href = a.getAttribute('href');
      if(href === page || (href === 'index.html' && page === '')) a.classList.add('active');
    });
  }

  function attachThemeToggle(){
    const btn = document.getElementById('theme-toggle');
    if(!btn) return;
    // load saved theme or system preference
    const saved = localStorage.getItem('sb_theme');
    if(saved) document.documentElement.setAttribute('data-theme', saved);
    else if(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.setAttribute('data-theme','dark');
    updateThemeIcon();
    btn.addEventListener('click', ()=>{
      const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('sb_theme', next);
      updateThemeIcon();
    });
  }

  function updateThemeIcon(){
    const btn = document.getElementById('theme-toggle');
    if(!btn) return;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    btn.textContent = isDark ? '☀️' : '🌙';
  }

  // toast
  window.showToast = function(msg, ms=1600){
    let t = document.getElementById('toast');
    if(!t){ t = document.createElement('div'); t.id='toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(()=> t.classList.remove('show'), ms);
  };

  // loading overlay
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

  // copy helper
  window.copyToClipboard = async function(text){
    try{ await navigator.clipboard.writeText(text); showToast('リンクをコピーしました！'); }
    catch(e){ showToast('コピーに失敗しました'); }
  };

  document.addEventListener('DOMContentLoaded', loadNav);
})();
