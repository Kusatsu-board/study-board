/* ui.js — いいね・ブックマーク統一、UI補助 */
(function(){
  // Like / Bookmark handler
  document.addEventListener('click', e=>{
    const btn = e.target.closest('.icon-btn[data-action]');
    if(!btn) return;
    const act = btn.dataset.action;
    if(act==='like') toggleLike(btn);
    if(act==='bookmark') toggleBookmark(btn);
  });

  function toggleLike(btn){
    const liked = btn.classList.toggle('liked');
    btn.classList.add('like-pulse');
    setTimeout(()=>btn.classList.remove('like-pulse'),400);
    showToast(liked ? 'いいねしました！' : 'いいねを解除しました');
  }

  function toggleBookmark(btn){
    const marked = btn.classList.toggle('bookmarked');
    showToast(marked ? 'ブックマークしました！' : 'ブックマークを解除しました');
  }

  // コピー補助（リンクなど）
  window.copyToClipboard = async function(text){
    try{
      await navigator.clipboard.writeText(text);
      showToast('リンクをコピーしました！');
    }catch(e){
      showToast('コピーに失敗しました');
    }
  };
})();
